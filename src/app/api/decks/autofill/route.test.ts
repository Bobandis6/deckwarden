// @vitest-environment node
/**
 * POST /api/decks/autofill — the route's first test (Y6b, WAVE4 D7), over
 * mocked IO with the REAL planner and the real Magic adapter: the gathers,
 * the facts, the tournament read, the combo read, the fillers and the wires
 * are stand-ins, so these pin what the ROUTE decides about goals:
 *
 * - with no target (goals absent, goals without one, a budget alone) the
 *   shell is the no-goals plan exactly and no combo read runs;
 * - a target checks the body against the game (400 "Invalid goals" before
 *   any read), reads the entry facts with the adapter's flags, loads every
 *   combo complete within keep ∪ the pool (one read), keeps the shell inside
 *   the target, and says what it kept out — counted against the same seed's
 *   no-goals shell;
 * - the lock tier: on with no target and at 4, off at 3 and below;
 * - a target of 4 or 5 changes no pick.
 *
 * The live halves are smoke:autofill's goal cases and the seed-1,234,567
 * shell recorded before and after.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GAME_ID } from "@/db/seed-data";
import type { MtgAttrs } from "@/lib/games/mtg/attrs";
import { mtgAdapter } from "@/lib/games/mtg/adapter";
import { mtgShellNotes } from "@/lib/games/mtg/brackets";
import { card, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import type { CandidateCard } from "@/lib/recommend/types";

const mocks = vi.hoisted(() => ({
  loadEntryFacts: vi.fn(),
  loadFillerRows: vi.fn(),
  loadTournamentSignals: vi.fn(),
  gatherSignals: vi.fn(),
  loadCompleteCombos: vi.fn(),
  loadCardWires: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/recommend/queries", () => ({
  loadEntryFacts: mocks.loadEntryFacts,
  loadFillerRows: mocks.loadFillerRows,
  loadTournamentSignals: mocks.loadTournamentSignals,
}));
vi.mock("@/lib/recommend/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recommend/engine")>()),
  gatherSignals: mocks.gatherSignals,
}));
vi.mock("@/lib/combos/queries", () => ({ loadCompleteCombos: mocks.loadCompleteCombos }));
vi.mock("@/lib/cards/wire", () => ({ loadCardWires: mocks.loadCardWires }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: mocks.enforceRateLimit,
}));

const { POST } = await import("./route");

const WU = 1 | 2;
const named = (
  name: string,
  over: Omit<Partial<MtgCard>, "attrs"> & { attrs?: Partial<MtgAttrs> } = {},
): MtgCard =>
  card({
    ciMask: 1,
    colorsMask: 1,
    cheapestUsd: 1,
    ...over,
    name,
    externalKey: `oracle-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    attrs: {
      type_line: `${over.primaryType ?? "Creature"} — Test`,
      oracle_text: "",
      ...over.attrs,
    },
  });

const leader = named("Test Commander", { ciMask: WU, isLeaderCandidate: true, costValue: 3 });
// The curve pool: Game Changers and land denial among the most popular, two
// extra-turn cards, a measured staple far down the popularity order, and
// plain cards across the curve.
const gcs = [1, 2, 3].map((cv) =>
  named(`Changer ${cv}`, { costValue: cv, attrs: { game_changer: true } }),
);
const ruin = named("Ruin", { costValue: 4, attrs: { mld: "clear" } });
const turns = [5, 6].map((cv) =>
  named(`Time ${cv}`, { costValue: cv, attrs: { extra_turn: true } }),
);
const staple = named("Measured Staple", { costValue: 2 });
const plains = Array.from({ length: 70 }, (_, i) => named(`Plain ${i}`, { costValue: i % 8 }));
const curvePool = [...gcs, ruin, ...turns, ...plains, staple];
const popularity = new Map(curvePool.map((c, i) => [c.id, c === staple ? 5000 : i + 1]));
const lands = Array.from({ length: 12 }, (_, i) =>
  named(i === 0 ? "Cradle" : `Field ${i}`, {
    primaryType: "Land",
    costValue: null,
    attrs: i === 0 ? { game_changer: true } : {},
  }),
);
const basics = ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"].map((n) =>
  named(n, { primaryType: "Land", costValue: null, ciMask: 0 }),
);
const every = new Map([leader, ...curvePool, ...lands, ...basics].map((c) => [c.id, c]));

const candidate = (c: MtgCard, rank: number): CandidateCard => ({
  id: c.id,
  name: c.name,
  primaryType: c.primaryType,
  costValue: c.costValue,
  ciMask: c.ciMask,
  cheapestUsd: "1.00",
  popularity: rank,
  externalKey: c.externalKey,
  flags: Object.fromEntries(
    (["game_changer", "mld", "extra_turn"] as const).flatMap((k) =>
      c.attrs[k] !== undefined ? [[k, c.attrs[k]]] : [],
    ),
  ),
});

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/decks/autofill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return {
    res,
    body: (await res.json()) as {
      picks: { cardId: string; tier: string; qty: number }[];
      notes: string[];
      error?: string;
    },
  };
}
const BASE = { game: "mtg", format: "commander", leaderIds: [leader.id], seed: 1_234_567 };

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.enforceRateLimit.mockResolvedValue(null);
  mocks.loadEntryFacts.mockImplementation(async (_gameId: number, ids: string[]) => {
    return new Map(
      ids
        .filter((id) => every.has(id))
        .map((id) => {
          const c = every.get(id)!;
          const { primaryType, costValue, ...rest } = candidate(c, 1);
          return [
            id,
            {
              ...rest,
              primaryType,
              costValue,
              colorsMask: c.colorsMask,
              isLeaderCandidate: c.isLeaderCandidate,
              isPreview: false,
            },
          ];
        }),
    );
  });
  mocks.gatherSignals.mockImplementation(
    async (_snapshot: unknown, opts: { scope?: { op: string } }) => ({
      candidates:
        opts.scope?.op === "eq"
          ? lands.map((c, i) => candidate(c, i + 1))
          : curvePool.map((c) => candidate(c, popularity.get(c.id)!)),
      combosByCandidate: new Map(),
      combosTruncated: false,
    }),
  );
  mocks.loadTournamentSignals.mockResolvedValue({
    context: { commanderNames: ["Test Commander"], lists: 10, since: null },
    byCandidate: new Map([[staple.id, { lists: 9, top4: 3 }]]),
  });
  mocks.loadCompleteCombos.mockResolvedValue([]);
  mocks.loadFillerRows.mockResolvedValue(basics.map((c) => candidate(c, 1)));
  mocks.loadCardWires.mockImplementation(async (ids: string[]) =>
    [...new Set(ids)]
      .filter((id) => every.has(id))
      .map((id) => ({ ...every.get(id)!, image: null })),
  );
});

const flaggedIn = (picks: { cardId: string; qty: number }[], key: keyof MtgAttrs) =>
  picks.filter((p) => every.get(p.cardId)?.attrs[key] !== undefined).length;

describe("POST /api/decks/autofill — goals (Y6b)", () => {
  it("no target — goals absent, without one, or a budget alone — is the no-goals plan exactly; no combo read", async () => {
    const plain = await post(BASE);
    expect(plain.res.status).toBe(200);
    expect(plain.res.headers.get("cache-control")).toBe("no-store");
    expect(plain.body.notes).toEqual([]);
    for (const goals of [{ v: 1 }, { v: 1, budget: { perCardUsd: 5 } }, null]) {
      const { body } = await post({ ...BASE, goals });
      expect(body.picks).toEqual(plain.body.picks);
      expect(body.notes).toEqual([]);
    }
    expect(mocks.loadCompleteCombos).not.toHaveBeenCalled();
    // The facts carry the adapter's flags either way (one statement, wider).
    expect(mocks.loadEntryFacts).toHaveBeenCalledWith(
      GAME_ID.mtg,
      [leader.id],
      mtgAdapter.brackets!.flagPaths,
    );
    // The measured staple locks in with no target (WAVE4 F's other side).
    expect(plain.body.picks.find((p) => p.cardId === staple.id)?.tier).toBe("locked");
  });

  it("a target of 2: ONE combo read over keep ∪ the pool; no Game Changer, no land denial, one extra-turn card at most, the lock off — and notes for what it kept out", async () => {
    const free = await post(BASE);
    const { res, body } = await post({ ...BASE, goals: { v: 1, targetLevel: 2 } });
    expect(res.status).toBe(200);
    expect(mocks.loadCompleteCombos).toHaveBeenCalledTimes(1);
    const [ids] = mocks.loadCompleteCombos.mock.calls[0] as [string[]];
    expect(new Set(ids)).toEqual(
      new Set([leader.id, ...curvePool.map((c) => c.id), ...lands.map((c) => c.id)]),
    );

    expect(body.picks.reduce((n, p) => n + p.qty, 0)).toBe(99);
    expect(flaggedIn(body.picks, "game_changer")).toBe(0);
    expect(flaggedIn(body.picks, "mld")).toBe(0);
    expect(flaggedIn(body.picks, "extra_turn")).toBeLessThanOrEqual(1);
    expect(body.picks.some((p) => p.tier === "locked")).toBe(false);

    // Counted against the same seed's no-goals shell.
    const gcFree = flaggedIn(free.body.picks, "game_changer");
    const mldFree = flaggedIn(free.body.picks, "mld");
    const turnsFree = flaggedIn(free.body.picks, "extra_turn");
    expect(gcFree).toBeGreaterThan(0);
    expect(body.notes).toEqual(
      mtgShellNotes(
        {
          "game-changers": gcFree,
          "land-denial": mldFree,
          "extra-turns": Math.max(0, turnsFree - 1),
        },
        2,
      ),
    );
    expect(body.notes[0]).toBe(
      `Skipped ${gcFree} Game Changers — your Bracket 2 target allows none (Wizards' list)`,
    );
  });

  it("the lock tier: off at 3 and below, on at 4 — and a target of 4 or 5 changes no pick", async () => {
    const plain = await post(BASE);
    const at3 = await post({ ...BASE, goals: { v: 1, targetLevel: 3 } });
    expect(at3.body.picks.some((p) => p.tier === "locked")).toBe(false);
    expect(flaggedIn(at3.body.picks, "game_changer")).toBeLessThanOrEqual(3);
    for (const targetLevel of [4, 5]) {
      const { body } = await post({ ...BASE, goals: { v: 1, targetLevel } });
      expect(body.picks).toEqual(plain.body.picks);
      expect(body.notes).toEqual([]);
    }
  });

  it("goals that don't fit the game answer 400 before any read", async () => {
    for (const goals of [{ v: 1, targetLevel: 9 }, { v: 2 }, { v: 1, budget: { perCardUsd: 3 } }]) {
      const { res, body } = await post({ ...BASE, goals });
      expect(res.status).toBe(400);
      expect(body.error).toBe("Invalid goals");
    }
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
    expect(mocks.gatherSignals).not.toHaveBeenCalled();
  });

  it("One Piece answers 400 whatever its goals — no autofill, nothing read", async () => {
    const { res } = await post({ ...BASE, game: "optcg", format: "standard", goals: { v: 1 } });
    expect(res.status).toBe(400);
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
  });
});
