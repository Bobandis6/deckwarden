// @vitest-environment node
/**
 * Y7a — Swap Lab's pipeline over mocked IO (the loaders are stand-ins; the
 * gather, the ranker, Magic's bracket read and impact, applyGoals and the
 * Cut Coach are real). Pins what WAVE4 D8 decides beyond SQL: the filter it
 * asks for (the card's roles, the nonland scope, a ±1 cost window, the card
 * itself excluded), the order (most shared roles first, then the evidence),
 * the role line leading each card's evidence, a swap judged in the card's
 * place (the list without it), and the tradeoff taken from rankCuts. The
 * SQL half — which cards share a role — is smoke and gold-set territory.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { findFormat, GAME_ID } from "@/db/seed-data";
import type { CompleteCombo } from "@/lib/games/types";
import type { CandidateFilter, ReadFacts } from "./queries";
import type { CandidateCard, CandidateCombo } from "./types";

const mocks = vi.hoisted(() => ({
  loadCandidatePool: vi.fn(),
  loadCandidateRows: vi.fn(),
  loadComboSignals: vi.fn(),
  loadTournamentCandidates: vi.fn(),
  loadTournamentSignals: vi.fn(),
  loadCompleteCombos: vi.fn(),
}));

vi.mock("./queries", () => ({
  loadCandidatePool: mocks.loadCandidatePool,
  loadCandidateRows: mocks.loadCandidateRows,
  loadComboSignals: mocks.loadComboSignals,
  loadTournamentCandidates: mocks.loadTournamentCandidates,
  loadTournamentSignals: mocks.loadTournamentSignals,
}));
vi.mock("@/lib/combos/queries", () => ({ loadCompleteCombos: mocks.loadCompleteCombos }));

const { alternativesForSnapshot, costWindow, orderBySharedRoles, withoutOneCopy } =
  await import("./alternatives");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LEADER = uuid(1);
const SOL = uuid(2);
const GC_A = uuid(3);
const GC_B = uuid(4);
const PIECE = uuid(5);

const facts = (name: string, over: Partial<ReadFacts> = {}): ReadFacts => ({
  name,
  externalKey: `oracle-${name}`,
  colorsMask: 1,
  ciMask: 1,
  isLeaderCandidate: false,
  isPreview: false,
  cheapestUsd: "1.00",
  popularity: 500,
  flags: {},
  ...over,
});

const entry = (
  cardId: string,
  name: string,
  over: { qty?: number; type?: string; cost?: number | null; facts?: Partial<ReadFacts> } = {},
) => ({
  cardId,
  qty: over.qty ?? 1,
  primaryType: over.type ?? "Artifact",
  costValue: over.cost === undefined ? 1 : over.cost,
  facts: facts(name, over.facts),
});

/** A mono-white list: the leader, Sol Ring, two Game Changers and a combo piece. */
const snapshot = (extra: ReturnType<typeof entry>[] = []) => ({
  gameId: GAME_ID.mtg,
  formatId: findFormat("mtg", "commander")!.id,
  ciMask: 1,
  leaderIds: [LEADER],
  entries: [
    entry(LEADER, "Test Commander", { type: "Creature", cost: 3 }),
    entry(SOL, "Sol Ring", { facts: { popularity: 1, flags: { game_changer: true } } }),
    entry(GC_A, "Smothering Tithe", { cost: 4, facts: { flags: { game_changer: true } } }),
    entry(GC_B, "Enlightened Tutor", { cost: 1, facts: { flags: { game_changer: true } } }),
    entry(PIECE, "Basalt Monolith", { cost: 3 }),
    ...extra,
  ],
});

const cand = (n: number, name: string, roles: string[], over: Partial<CandidateCard> = {}) => ({
  id: uuid(100 + n),
  name,
  primaryType: "Artifact",
  costValue: 2,
  ciMask: 0,
  cheapestUsd: "1.00",
  popularity: 100 + n,
  externalKey: `oracle-${name}`,
  flags: {},
  roles,
  ...over,
});

const SIGNET = cand(1, "Arcane Signet", ["mana-rock", "ramp"], { popularity: 5 });
const STONE = cand(2, "Mind Stone", ["card-draw", "mana-rock", "ramp"], { popularity: 30 });
const KNIGHT = cand(3, "Knight of the White Orchid", ["land-ramp", "ramp"], {
  primaryType: "Creature",
  popularity: 2,
});
const VAULT = cand(4, "Mana Vault", ["mana-rock", "ramp"], {
  popularity: 50,
  flags: { game_changer: true },
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.loadCandidatePool.mockResolvedValue([KNIGHT, SIGNET, STONE, VAULT]);
  mocks.loadCandidateRows.mockResolvedValue([]);
  mocks.loadComboSignals.mockResolvedValue({ byCandidate: new Map(), truncated: false });
  mocks.loadTournamentCandidates.mockResolvedValue([]);
  mocks.loadTournamentSignals.mockResolvedValue({ context: null, byCandidate: new Map() });
  mocks.loadCompleteCombos.mockResolvedValue([]);
});

const request = (over: Partial<Parameters<typeof alternativesForSnapshot>[0]> = {}) => ({
  snapshot: snapshot(),
  cardId: SOL,
  roles: ["ramp", "mana-rock"],
  costValue: 1,
  goals: null,
  ...over,
});

describe("alternativesForSnapshot", () => {
  it("asks for the card's roles, the nonland scope and a ±1 cost window, the card itself excluded — over the list without it", async () => {
    await alternativesForSnapshot(request());
    const [filter] = mocks.loadCandidatePool.mock.calls[0] as [CandidateFilter];
    expect(filter.roles).toEqual({ path: "roles", any: ["ramp", "mana-rock"] });
    expect(filter.scope).toEqual([
      { column: "primary_type", op: "ne", value: "Land" },
      { column: "cost_value", op: "between", min: 0, max: 2 },
    ]);
    expect(filter.excludeCardIds).toContain(SOL);
    expect(filter.deckCiMask).toBe(1);
    // The one-away scan runs on the list WITHOUT the card: a combo it was
    // part of isn't completed by its replacement.
    const [deckIds] = mocks.loadComboSignals.mock.calls[0] as [string[]];
    expect(deckIds).not.toContain(SOL);
    expect(deckIds).toContain(PIECE);
    // One tournament read for both sides: candidates and the list's own cards.
    expect(mocks.loadTournamentSignals).toHaveBeenCalledTimes(1);
  });

  it("Sol Ring offers mana rocks first — the most shared roles, then the evidence — and the role line leads", async () => {
    const res = await alternativesForSnapshot(request());
    expect(res.alternatives.map((a) => a.name)).toEqual([
      "Arcane Signet",
      "Mind Stone",
      "Mana Vault",
      "Knight of the White Orchid", // shares ramp alone, so it trails every rock
    ]);
    expect(res.alternatives[0].shared).toEqual(["ramp", "mana-rock"]);
    expect(res.alternatives[3].shared).toEqual(["ramp"]);
    expect(res.alternatives[0].evidence[0]).toEqual({
      source: "scryfall_tagger",
      why: "Both: ramp · mana rock — community-tagged on Scryfall Tagger",
      with: [],
      howOften: null,
      confidence: "medium",
    });
    // The ranker's own evidence follows (EDHREC here), untouched.
    expect(res.alternatives[0].evidence[1].source).toBe("edhrec_rank");
    expect(res.alternatives[0].confidence).toBe("high");
  });

  it("a swap is judged in the card's place: a Game Changer for a Game Changer at target 3 stays in", async () => {
    // Three Game Changers in the list (Sol Ring among them); a fourth would
    // be over the allowance — but Sol Ring leaves as Mana Vault comes in.
    const goals = { targetLevel: 3 };
    const res = await alternativesForSnapshot(request({ goals }));
    expect(res.alternatives.map((a) => a.name)).toContain("Mana Vault");
    expect(res.hidden).toEqual([]);
    // Swapping a card that ISN'T a Game Changer for one is a fourth: hidden.
    const plain = snapshot([entry(uuid(9), "Mind's Eye", { cost: 5 })]);
    const res2 = await alternativesForSnapshot(
      request({ snapshot: plain, cardId: uuid(9), costValue: 5, goals }),
    );
    expect(res2.hidden.map((h) => h.name)).toEqual(["Mana Vault"]);
    expect(res2.hidden[0].conflicts[0]).toMatchObject({ rule: "game-changers", severity: "hide" });
  });

  it("the tradeoff is the Cut Coach's: cutting a combo piece warns first; a card with no evidence has none", async () => {
    const combo: CompleteCombo = {
      key: "1-2",
      cardPieces: [PIECE, SOL].sort(),
      templates: [],
      tag: "R",
      relevant: true,
      results: ["Infinite colorless mana"],
      popularity: 1200,
    };
    mocks.loadCompleteCombos.mockResolvedValue([combo]);
    const res = await alternativesForSnapshot(request());
    expect(res.tradeoff?.[0]).toMatchObject({ side: "keep", source: "spellbook" });
    expect(res.tradeoff?.[0].with).toEqual([{ cardId: PIECE, name: "Basalt Monolith" }]);
    expect(res.tradeoff?.some((e) => e.source === "edhrec_rank" && e.side === "keep")).toBe(true);

    // An unranked card outside any combo, in a curve slot under the template: nothing to say.
    mocks.loadCompleteCombos.mockResolvedValue([]);
    const quiet = snapshot([
      entry(uuid(9), "Obscure Rock", { cost: 2, facts: { popularity: null } }),
    ]);
    const res2 = await alternativesForSnapshot(
      request({ snapshot: quiet, cardId: uuid(9), costValue: 2 }),
    );
    expect(res2.tradeoff).toBeNull();
  });

  it("the goals read sees the list without the card: its combos drop out with it", async () => {
    // No Game Changers here: the list reads at least Bracket 3 only through
    // Sol Ring's two-card combo. Without Sol Ring that combo is gone, so a
    // Game Changer in its place WOULD raise the line — and says so.
    const combo: CompleteCombo = {
      key: "1-2",
      cardPieces: [PIECE, SOL].sort(),
      templates: [],
      tag: "R",
      relevant: true,
      results: ["Infinite colorless mana"],
      popularity: 1200,
    };
    mocks.loadCompleteCombos.mockResolvedValue([combo]);
    const quiet = {
      ...snapshot(),
      entries: [
        entry(LEADER, "Test Commander", { type: "Creature", cost: 3 }),
        entry(SOL, "Sol Ring", { facts: { popularity: 1 } }),
        entry(PIECE, "Basalt Monolith", { cost: 3 }),
      ],
    };
    const res = await alternativesForSnapshot(request({ snapshot: quiet }));
    const vault = res.alternatives.find((a) => a.name === "Mana Vault")!;
    expect(vault.conflicts).toEqual([
      expect.objectContaining({ rule: "game-changers", severity: "flag" }),
    ]);
    expect(vault.conflicts[0].why).toMatch(/^Would make this deck at least Bracket 3/);
  });

  it("a candidate that completes a combo with the rest of the list says so in its evidence", async () => {
    const combo: CandidateCombo = {
      key: "9-9",
      withPieces: [{ cardId: PIECE, name: "Basalt Monolith" }],
      results: ["Infinite colorless mana"],
      templates: [],
      popularity: 900,
      tag: "R",
      relevant: true,
      pieceCount: 2,
      usesLeader: false,
    };
    mocks.loadComboSignals.mockResolvedValue({
      byCandidate: new Map([[STONE.id, [combo]]]),
      truncated: true,
    });
    const res = await alternativesForSnapshot(request());
    const stone = res.alternatives.find((a) => a.name === "Mind Stone")!;
    expect(stone.evidence.map((e) => e.source)).toContain("spellbook");
    expect(res.combosTruncated).toBe(true);
  });

  it("no roles, no alternatives — and no query", async () => {
    const res = await alternativesForSnapshot(request({ roles: [] }));
    expect(res).toEqual({ alternatives: [], hidden: [], combosTruncated: false, tradeoff: null });
    expect(mocks.loadCandidatePool).not.toHaveBeenCalled();
  });

  it("a card without a cost gets no window; the limit cuts after the goals", async () => {
    await alternativesForSnapshot(request({ costValue: null }));
    const [filter] = mocks.loadCandidatePool.mock.calls[0] as [CandidateFilter];
    expect(filter.scope).toEqual([{ column: "primary_type", op: "ne", value: "Land" }]);
    const two = await alternativesForSnapshot(request({ limit: 2 }));
    expect(two.alternatives.map((a) => a.name)).toEqual(["Arcane Signet", "Mind Stone"]);
  });
});

describe("the pure parts", () => {
  it("withoutOneCopy takes one copy off the last entry holding the card", () => {
    const s = snapshot([entry(uuid(8), "Relentless Rats", { qty: 3, cost: 3 })]);
    expect(withoutOneCopy(s, uuid(8)).entries.at(-1)).toMatchObject({ cardId: uuid(8), qty: 2 });
    expect(withoutOneCopy(s, SOL).entries.map((e) => e.cardId)).not.toContain(SOL);
    expect(withoutOneCopy(s, uuid(77))).toBe(s);
  });

  it("costWindow never goes below zero", () => {
    expect(costWindow(0, 1)).toEqual({ column: "cost_value", op: "between", min: 0, max: 1 });
    expect(costWindow(4, 1)).toEqual({ column: "cost_value", op: "between", min: 3, max: 5 });
  });

  it("orderBySharedRoles keeps the ranker's order inside a count and drops rows sharing nothing", () => {
    const rec = (id: string) => ({
      cardId: id,
      name: id,
      primaryType: null,
      costValue: null,
      ciMask: 0,
      cheapestUsd: null,
      popularity: null,
      score: 0,
      confidence: "low" as const,
      evidence: [],
    });
    const out = orderBySharedRoles(
      [rec("a"), rec("b"), rec("c"), rec("d")],
      new Map([
        ["a", ["ramp"]],
        ["b", ["mana-rock", "ramp"]],
        ["c", ["burn"]],
        ["d", ["ramp", "mana-rock"]],
      ]),
      ["mana-rock", "ramp"],
      ["ramp", "mana-rock"],
      (shared) => ({
        source: "s",
        why: shared.join("+"),
        with: [],
        howOften: null,
        confidence: "medium",
      }),
    );
    expect(out.map((r) => [r.cardId, r.shared])).toEqual([
      ["b", ["ramp", "mana-rock"]],
      ["d", ["ramp", "mana-rock"]],
      ["a", ["ramp"]],
    ]);
    expect(out[0].evidence[0].why).toBe("ramp+mana-rock");
    expect(out[0].confidence).toBe("medium");
  });
});
