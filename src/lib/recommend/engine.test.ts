// @vitest-environment node
/**
 * Y6a — the engine's order, over mocked IO (the loaders are stand-ins; the
 * ranker, the read and applyGoals are real): rank all → goals → slice. A
 * pool whose 25 best cards are all Game Changers, at a target of 2, answers
 * the 25 next ones with the 25 counted as hidden — never a list cut first
 * and then filtered short. Also: the list is read once, on the server, with
 * one more statement (the complete combos) and only where a read exists — a
 * leader, every entry's facts, a game with `brackets`. BRACKET-UP's power
 * first: the Game Changers a target needs lead, found past the 25 best and
 * never a land (the upgrade pairs by cost), the rest in their own order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { findFormat, GAME_ID } from "@/db/seed-data";
import type { ReadFacts } from "./queries";
import type { CandidateCard } from "./types";

const mocks = vi.hoisted(() => ({
  loadCandidatePool: vi.fn(),
  loadCandidateRows: vi.fn(),
  loadComboSignals: vi.fn(),
  loadDeckEntries: vi.fn(),
  loadTournamentCandidates: vi.fn(),
  loadTournamentSignals: vi.fn(),
  loadCompleteCombos: vi.fn(),
}));

vi.mock("./queries", () => ({
  loadCandidatePool: mocks.loadCandidatePool,
  loadCandidateRows: mocks.loadCandidateRows,
  loadComboSignals: mocks.loadComboSignals,
  loadDeckEntries: mocks.loadDeckEntries,
  loadTournamentCandidates: mocks.loadTournamentCandidates,
  loadTournamentSignals: mocks.loadTournamentSignals,
}));
vi.mock("@/lib/combos/queries", () => ({ loadCompleteCombos: mocks.loadCompleteCombos }));

const { recommendForSnapshot, POOL_LIMIT } = await import("./engine");
const { mtgAdapter } = await import("@/lib/games/mtg/adapter");

const LEADER = "10000000-0000-4000-8000-000000000000";
const facts = (name: string, flags: Record<string, unknown> = {}): ReadFacts => ({
  name,
  externalKey: `oracle-${name}`,
  colorsMask: 0,
  ciMask: 0,
  isLeaderCandidate: false,
  isPreview: false,
  cheapestUsd: "1.00",
  popularity: 100,
  flags,
});

/** 50 candidates by popularity: the 25 best are Game Changers. */
const POOL: CandidateCard[] = Array.from({ length: 50 }, (_, i) => ({
  id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  name: `Card ${String(i + 1).padStart(2, "0")}`,
  primaryType: "Land", // outside the curve: popularity alone orders them
  costValue: null,
  ciMask: 0,
  cheapestUsd: "1.00",
  popularity: i + 1,
  externalKey: `oracle-card-${i + 1}`,
  flags: i < 25 ? { game_changer: true } : {},
}));

const snapshot = (withFacts = true) => ({
  gameId: GAME_ID.mtg,
  formatId: findFormat("mtg", "commander")!.id,
  ciMask: 0,
  leaderIds: [LEADER],
  entries: [
    {
      cardId: LEADER,
      qty: 1,
      primaryType: "Creature",
      costValue: 3,
      ...(withFacts ? { facts: facts("Test Commander") } : {}),
    },
  ],
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.loadCandidatePool.mockResolvedValue(POOL);
  mocks.loadCandidateRows.mockResolvedValue([]);
  mocks.loadComboSignals.mockResolvedValue({ byCandidate: new Map(), truncated: false });
  mocks.loadTournamentCandidates.mockResolvedValue([]);
  mocks.loadTournamentSignals.mockResolvedValue({ context: null, byCandidate: new Map() });
  mocks.loadCompleteCombos.mockResolvedValue([]);
});

describe("recommendForSnapshot — rank all → goals → slice (Y6a)", () => {
  it("the 25 best above a target of 2: 25 others come back, the 25 hidden and counted, each in rank order", async () => {
    const out = await recommendForSnapshot(snapshot(), { goals: { targetLevel: 2 } });
    expect(out.recommendations.map((r) => r.name)).toEqual(POOL.slice(25).map((c) => c.name));
    expect(out.hidden.map((r) => r.name)).toEqual(POOL.slice(0, 25).map((c) => c.name));
    expect(out.hidden[0].conflicts.map((c) => c.why)).toEqual([
      "A Game Changer (Wizards' list). Your Bracket 2 target allows none",
    ]);
    expect(out.combosTruncated).toBe(false);
  });

  it("no target: the same 25 best, flagged — nothing hidden", async () => {
    const out = await recommendForSnapshot(snapshot());
    expect(out.recommendations.map((r) => r.name)).toEqual(POOL.slice(0, 25).map((c) => c.name));
    expect(out.hidden).toEqual([]);
    expect(out.recommendations[0].conflicts.map((c) => [c.severity, c.why])).toEqual([
      ["flag", "Would make this deck at least Bracket 3: a Game Changer (Wizards' list)"],
    ]);
  });

  it("reads the list once: one complete-combos load over the entries, beside the gather; the flags ride every pool", async () => {
    await recommendForSnapshot(snapshot(), { goals: { targetLevel: 2 } });
    expect(mocks.loadCompleteCombos).toHaveBeenCalledTimes(1);
    expect(mocks.loadCompleteCombos).toHaveBeenCalledWith([LEADER]);
    const flagPaths = mtgAdapter.brackets!.flagPaths;
    expect(mocks.loadCandidatePool).toHaveBeenCalledWith(expect.anything(), POOL_LIMIT, flagPaths);
    expect(mocks.loadComboSignals).toHaveBeenCalledWith([LEADER], 0, [LEADER]);
  });

  it("no read without every entry's facts: no extra statement, no bracket goals — the budget still applies", async () => {
    const out = await recommendForSnapshot(snapshot(false), {
      goals: { targetLevel: 2, budget: { perCardUsd: 1 } },
      maxPriceUsd: 5,
    });
    expect(mocks.loadCompleteCombos).not.toHaveBeenCalled();
    expect(out.hidden).toEqual([]);
    expect(out.recommendations).toHaveLength(25);
  });

  it("the goals' answers reach the read: a list the owner says wins before turn 6 reads 4, so a Game Changer raises nothing", async () => {
    const out = await recommendForSnapshot(snapshot(), {
      goals: { answers: { rulesetVersion: 1, play: { fast: "yes" } } },
    });
    expect(out.recommendations.map((r) => r.name)).toEqual(POOL.slice(0, 25).map((c) => c.name));
    expect(out.recommendations.every((r) => r.conflicts.length === 0)).toBe(true);
  });

  it("a truncated combo scan is passed through for the panel to disclose", async () => {
    mocks.loadComboSignals.mockResolvedValue({ byCandidate: new Map(), truncated: true });
    const out = await recommendForSnapshot(snapshot());
    expect(out.combosTruncated).toBe(true);
  });

  it("One Piece: no signals, nothing loaded", async () => {
    const out = await recommendForSnapshot({ ...snapshot(), gameId: GAME_ID.optcg });
    expect(out).toEqual({ recommendations: [], hidden: [], combosTruncated: false });
    expect(mocks.loadCandidatePool).not.toHaveBeenCalled();
    expect(mocks.loadCompleteCombos).not.toHaveBeenCalled();
  });
});

describe("recommendForSnapshot — power first (BRACKET-UP)", () => {
  const card = (n: number, name: string, over: Partial<CandidateCard>): CandidateCard => ({
    id: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    primaryType: "Artifact",
    costValue: 2,
    ciMask: 0,
    cheapestUsd: "1.00",
    popularity: n,
    externalKey: `oracle-power-${n}`,
    flags: {},
    ...over,
  });
  /** 40 plain spells rank first; then two Game Changer lands, then six Game Changer spells. */
  const RANKED: CandidateCard[] = [
    ...Array.from({ length: 40 }, (_, i) =>
      card(i + 1, `Spell ${String(i + 1).padStart(2, "0")}`, {}),
    ),
    card(41, "Changer Land A", {
      primaryType: "Land",
      costValue: 0,
      flags: { game_changer: true },
    }),
    card(42, "Changer Land B", {
      primaryType: "Land",
      costValue: 0,
      flags: { game_changer: true },
    }),
    ...Array.from({ length: 6 }, (_, i) =>
      card(43 + i, `Changer ${i + 1}`, {
        primaryType: "Enchantment",
        costValue: 3,
        flags: { game_changer: true },
      }),
    ),
  ];
  const names = (rows: { name: string }[]) => rows.map((r) => r.name);

  beforeEach(() => mocks.loadCandidatePool.mockResolvedValue(RANKED));

  it("at a target of 4 the four Game Changers the list needs lead, from past the 25 best, lands passed over; the rest keep their order", async () => {
    const plain = await recommendForSnapshot(snapshot(), { goals: { targetLevel: 4 } });
    expect(names(plain.recommendations).some((n) => n.startsWith("Changer"))).toBe(false);
    const out = await recommendForSnapshot(snapshot(), {
      goals: { targetLevel: 4 },
      powerFirst: true,
    });
    expect(names(out.recommendations).slice(0, 4)).toEqual([
      "Changer 1",
      "Changer 2",
      "Changer 3",
      "Changer 4",
    ]);
    expect(names(out.recommendations).slice(4)).toEqual(names(plain.recommendations).slice(0, 21));
    expect(out.recommendations).toHaveLength(25);
    expect(out.hidden).toEqual(plain.hidden);
  });

  it("at a target of 3, the one Game Changer it needs", async () => {
    const out = await recommendForSnapshot(snapshot(), {
      goals: { targetLevel: 3 },
      powerFirst: true,
    });
    expect(names(out.recommendations)[0]).toBe("Changer 1");
    expect(names(out.recommendations).filter((n) => n.startsWith("Changer"))).toEqual([
      "Changer 1",
    ]);
  });

  it("nothing leads without a target, at a target no count shows (2), or without the ask", async () => {
    const plain = names((await recommendForSnapshot(snapshot())).recommendations);
    expect(
      names((await recommendForSnapshot(snapshot(), { powerFirst: true })).recommendations),
    ).toEqual(plain);
    const two = await recommendForSnapshot(snapshot(), {
      goals: { targetLevel: 2 },
      powerFirst: true,
    });
    expect(names(two.recommendations).some((n) => n.startsWith("Changer"))).toBe(false);
  });
});
