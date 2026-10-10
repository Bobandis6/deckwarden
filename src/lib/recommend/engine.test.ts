// @vitest-environment node
/**
 * Y6a — the engine's order, over mocked IO (the loaders are stand-ins; the
 * ranker, the read and applyGoals are real): rank all → goals → slice. A
 * pool whose 25 best cards are all Game Changers, at a target of 2, answers
 * the 25 next ones with the 25 counted as hidden — never a list cut first
 * and then filtered short. Also: the list is read once, on the server, with
 * one more statement (the complete combos) and only where a read exists — a
 * leader, every entry's facts, a game with `brackets`.
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
      "A Game Changer (Wizards' list) — your Bracket 2 target allows none",
    ]);
    expect(out.combosTruncated).toBe(false);
  });

  it("no target: the same 25 best, flagged — nothing hidden", async () => {
    const out = await recommendForSnapshot(snapshot());
    expect(out.recommendations.map((r) => r.name)).toEqual(POOL.slice(0, 25).map((c) => c.name));
    expect(out.hidden).toEqual([]);
    expect(out.recommendations[0].conflicts.map((c) => [c.severity, c.why])).toEqual([
      ["flag", "Would make this deck at least Bracket 3 — a Game Changer (Wizards' list)"],
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
