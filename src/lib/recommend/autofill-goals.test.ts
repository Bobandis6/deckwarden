/**
 * Y6b — the starter shell built for a target stays inside it (WAVE4 D7), the
 * planner with the REAL Magic adapter behind its goals check:
 *
 * - the caps count the picks so far (and the kept cards): Game Changers 0 at
 *   targets 1–2 and three in all at 3; extra-turn cards 0 at 1 and one at
 *   2–3; land denial and above-target combos never — over many seeds;
 * - goals filter BEFORE sampling: every sampling window fits the target
 *   together with the picks so far, the sampler is untouched and
 *   `Math.random` never runs;
 * - a check that admits everything changes nothing (the windows, the stream);
 * - the lock tier: on with no target and at 4, off at 3 and below;
 * - WAVE4 E's acceptance: the shell a target of 2 builds reads within it
 *   ("Your target: Bracket 2 · nothing here goes past Core"), while the same
 *   seed without goals reads above it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const windows = vi.hoisted(() => [] as string[][]);
vi.mock("./rng", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rng")>();
  return {
    ...actual,
    sampleWeighted: <T>(
      items: readonly T[],
      n: number,
      weightOf: (item: T) => number,
      rand: () => number,
    ) => {
      windows.push(items.map((i) => (i as { cardId: string }).cardId));
      return actual.sampleWeighted(items, n, weightOf, rand);
    },
  };
});

import type { MtgAttrs } from "@/lib/games/mtg/attrs";
import { mtgAutofill } from "@/lib/games/mtg/recommend";
import { BRACKET_RULESET } from "@/lib/games/mtg/bracket-ruleset";
import { card, cardMap, entry, fillers, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type {
  AutofillMeta,
  BracketFreshness,
  CardData,
  CompleteCombo,
  RecommendMeta,
} from "@/lib/games/types";
import { buildShell, locksStaples, type ShellInput } from "./autofill";
import type { TournamentSignal } from "./rank";
import { shellGoals } from "./shell-goals";
import type { Recommendation } from "./types";

const brackets = getAdapter("mtg").brackets!;

const AUTOFILL: AutofillMeta = {
  base: {
    label: "Lands",
    source: "land-template",
    count: 4,
    scope: { column: "primary_type", op: "eq", value: "Land" },
    isBase: (c) => c.primaryType === "Land",
    rankedByColorCount: [4, 4, 4],
    maxColorlessIdentity: 4,
    fillerNames: ["Plains"],
    fillers: ({ n }) => (n > 0 ? [{ name: "Plains", qty: n, why: "basic filler" }] : []),
  },
  lockShare: 0.5,
  lockMinLists: 5,
  lockMinTarget: 4,
  costTextOf: () => null,
  curveLabel: (label) => `Mana value ${label}`,
};
const CURVE: NonNullable<RecommendMeta["curve"]> = {
  source: "curve-template",
  buckets: [5, 6, 5],
  bucketOf: (c) =>
    c.primaryType === "Land" || c.costValue === null ? null : Math.min(2, Math.max(0, c.costValue)),
  evidence: () => ({ why: "gap" }),
};

const named = (
  name: string,
  costValue: number | null,
  attrs: Partial<MtgAttrs> = {},
  primaryType = "Creature",
) =>
  card({
    name,
    costValue,
    primaryType,
    externalKey: `oracle-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    attrs: { type_line: `${primaryType} — Test`, oracle_text: "", ...attrs },
  });

// Per bucket: two Game Changers on top, land denial, two extra-turn cards,
// a two-card combo's halves (both in the same bucket) and plain cards.
const pool: MtgCard[] = [];
const comboPairs: [MtgCard, MtgCard][] = [];
for (let b = 0; b < 3; b++) {
  pool.push(
    named(`Changer ${b}a`, b, { game_changer: true }),
    named(`Changer ${b}b`, b, { game_changer: true }),
  );
  pool.push(named(`Ruin ${b}`, b, { mld: "clear" }), named(`Maybe Ruin ${b}`, b, { mld: "edge" }));
  pool.push(
    named(`Time ${b}a`, b, { extra_turn: true }),
    named(`Time ${b}b`, b, { extra_turn: true }),
  );
  const pair: [MtgCard, MtgCard] = [named(`Half ${b}a`, b), named(`Half ${b}b`, b)];
  comboPairs.push(pair);
  pool.push(...pair);
  for (let i = 0; i < 10; i++) pool.push(named(`Plain ${b}-${i}`, b));
}
const lands = [
  named("Cradle", null, { game_changer: true }, "Land"),
  named("Ruined Field", null, { mld: "clear" }, "Land"),
  ...Array.from({ length: 6 }, (_, i) => named(`Field ${i}`, null, {}, "Land")),
];
const combos: CompleteCombo[] = comboPairs.map(([a, b], i) => ({
  key: `pair-${i}`,
  cardPieces: [a.id, b.id].sort(),
  templates: [],
  tag: "E",
  relevant: true,
  results: ["Infinite mana"],
  popularity: 900,
}));
const commander = card({ name: "Test Commander", isLeaderCandidate: true });

// Flat-ish scores, the flagged cards on top: without goals they're sampled often.
const toRec = (c: MtgCard, score: number): Recommendation => ({
  cardId: c.id,
  name: c.name,
  primaryType: c.primaryType,
  costValue: c.costValue,
  ciMask: 1,
  cheapestUsd: "1.00",
  popularity: 1,
  score,
  confidence: "high",
  evidence: [{ source: "edhrec_rank", why: "why", with: [], howOften: null, confidence: "high" }],
});
const flagged = (c: MtgCard) =>
  c.attrs.game_changer === true || c.attrs.mld !== undefined || c.attrs.extra_turn === true;
const recs = pool
  .map((c, i) =>
    toRec(c, flagged(c) || c.name.startsWith("Half") ? 0.9 - i * 0.001 : 0.6 - i * 0.001),
  )
  .sort((a, b) => b.score - a.score);
const landRecs = lands.map((c, i) => toRec(c, 0.9 - i * 0.05));

const SLOTS = 20; // 4 lands + [5, 6, 5]

function goalsFor(targetLevel: number, keep: MtgCard[] = []) {
  return shellGoals({
    meta: brackets,
    deck: {
      gameId: "mtg",
      formatCode: "commander",
      zones: { commander: [entry(commander)], main: keep.map((c) => entry(c)) },
    },
    cards: cardMap([commander, ...keep]) as ReadonlyMap<string, CardData>,
    candidates: cardMap([...pool, ...lands]) as ReadonlyMap<string, CardData>,
    combos,
    zone: "main",
    targetLevel,
    answers: null,
  });
}

function shellInput(over: Partial<ShellInput> = {}): ShellInput {
  return {
    autofill: AUTOFILL,
    curve: CURVE,
    slots: SLOTS,
    keep: [],
    ciMask: 1,
    pool: recs,
    basePool: landRecs,
    tournamentContext: null,
    tournamentsByCandidate: new Map(),
    comboCandidateIds: new Set(),
    zone: "main",
    seed: 42,
    ...over,
  };
}

const byId = cardMap([...pool, ...lands]);
const picksOf = (input: ShellInput) => buildShell(input).picks.map((p) => byId.get(p.cardId)!);
const count = (cards: MtgCard[], test: (c: MtgCard) => boolean) => cards.filter(test).length;
const isGc = (c: MtgCard) => c.attrs.game_changer === true;
const isMld = (c: MtgCard) => c.attrs.mld !== undefined;
const isTurn = (c: MtgCard) => c.attrs.extra_turn === true;
const completesPair = (cards: MtgCard[]) =>
  comboPairs.some(([a, b]) => cards.includes(a) && cards.includes(b));
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

afterEach(() => {
  windows.length = 0;
  vi.restoreAllMocks();
});

describe("autofill with goals (Y6b) — the shell stays inside the target", () => {
  it("without goals the fixture is meaningful: the shell holds Game Changers, land denial, extra turns and a combo", () => {
    const shells = SEEDS.map((seed) => picksOf(shellInput({ seed })));
    // Every free shell breaks a target of 2 (Game Changers, land denial); most pass 3 too.
    expect(shells.every((s) => count(s, isGc) >= 2 && count(s, isMld) >= 2)).toBe(true);
    expect(shells.filter((s) => count(s, isGc) > 3).length).toBeGreaterThan(SEEDS.length / 2);
    expect(shells.filter((s) => count(s, isTurn) > 1).length).toBeGreaterThan(SEEDS.length / 2);
    expect(shells.filter(completesPair).length).toBeGreaterThan(SEEDS.length / 2);
  });

  it("a check that admits everything changes nothing — the same windows, the same picks", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      windows.length = 0;
      const plain = buildShell(shellInput({ seed })).picks;
      const plainWindows = [...windows];
      windows.length = 0;
      const admitted = buildShell(shellInput({ seed, goals: { conflicts: () => [] } })).picks;
      expect(admitted).toEqual(plain);
      expect(windows).toEqual(plainWindows);
    }
  });

  it("target 3: three Game Changers at most across the shell (lands included); with two kept, one", () => {
    for (const seed of SEEDS) {
      const shell = picksOf(shellInput({ seed, goals: goalsFor(3) }));
      expect(count(shell, isGc)).toBeLessThanOrEqual(3);
      expect(count(shell, isMld)).toBe(0);
      expect(count(shell, isTurn)).toBeLessThanOrEqual(1);
      const kept = pool.filter(isGc).slice(-2);
      const withKept = picksOf(
        shellInput({
          seed,
          keep: kept.map((c) => ({ qty: 1, card: c })),
          pool: recs.filter((r) => !kept.some((k) => k.id === r.cardId)),
          goals: goalsFor(3, kept),
        }),
      );
      expect(count(withKept, isGc)).toBeLessThanOrEqual(1);
    }
  });

  it("targets 1 and 2: no Game Changer, no land denial, no two-card combo; extra turns none at 1, one at most at 2 (a kept one counts)", () => {
    for (const seed of SEEDS) {
      for (const t of [1, 2]) {
        const shell = picksOf(shellInput({ seed, goals: goalsFor(t) }));
        expect(count(shell, isGc)).toBe(0);
        expect(count(shell, isMld)).toBe(0);
        expect(completesPair(shell)).toBe(false);
        expect(count(shell, isTurn)).toBeLessThanOrEqual(t === 1 ? 0 : 1);
        expect(shell).toHaveLength(SLOTS); // the plain cards still fill every slot
      }
      const keptTurn = pool.filter(isTurn)[0];
      const shell = picksOf(
        shellInput({
          seed,
          keep: [{ qty: 1, card: keptTurn }],
          pool: recs.filter((r) => r.cardId !== keptTurn.id),
          goals: goalsFor(2, [keptTurn]),
        }),
      );
      expect(count(shell, isTurn)).toBe(0);
    }
  });

  it("every tier asks the check — a locked staple, a combo completion, a borrowed card and a land it rules out stay out", () => {
    const rule = { rule: "test", level: 9, source: "Test", why: "ruled out" };
    const banned = new Set<string>();
    const goals = { conflicts: (id: string) => (banned.has(id) ? [rule] : []) };
    // Tier A and B: a staple that locks and a combo completion, both ruled out.
    const staple = recs.find((r) => r.name === "Plain 1-9")!;
    const comboCard = recs.find((r) => r.name === "Plain 2-8")!;
    const tiered = shellInput({
      tournamentContext: { commanderNames: ["Test Commander"], lists: 10, since: null },
      tournamentsByCandidate: new Map<string, TournamentSignal>([
        [staple.cardId, { lists: 9, top4: 4 }],
      ]),
      comboCandidateIds: new Set([comboCard.cardId]),
    });
    expect(buildShell(tiered).picks.map((p) => p.cardId)).toEqual(
      expect.arrayContaining([staple.cardId, comboCard.cardId]),
    );
    banned.add(staple.cardId).add(comboCard.cardId);
    const asked = buildShell({ ...tiered, goals }).picks.map((p) => p.cardId);
    expect(asked).not.toContain(staple.cardId);
    expect(asked).not.toContain(comboCard.cardId);

    // Borrowing: only cost-0 cards exist, so buckets 1 and 2 borrow in score order.
    const zeros = recs.filter((r) => r.costValue === 0 && !isTurn(byId.get(r.cardId)!));
    const dry = shellInput({ pool: zeros });
    const borrowed = buildShell(dry).picks.filter(
      (p) => p.group === "curve-0" && p.tier === "sampled",
    );
    expect(borrowed.length).toBeGreaterThan(5); // bucket 0's own five plus the borrowed share
    banned.clear();
    for (const r of zeros.slice(0, 3)) banned.add(r.cardId);
    const dryAsked = buildShell({ ...dry, goals }).picks.map((p) => p.cardId);
    for (const id of banned) expect(dryAsked).not.toContain(id);

    // The base: the top land ruled out.
    banned.clear();
    banned.add(landRecs[0].cardId);
    expect(buildShell(shellInput()).picks.map((p) => p.cardId)).toContain(landRecs[0].cardId);
    expect(buildShell(shellInput({ goals })).picks.map((p) => p.cardId)).not.toContain(
      landRecs[0].cardId,
    );
  });

  it("goals filter BEFORE sampling: every window fits the target with the picks so far — and Math.random never runs", () => {
    const random = vi.spyOn(Math, "random");
    for (const seed of SEEDS.slice(0, 10)) {
      windows.length = 0;
      buildShell(shellInput({ seed, goals: goalsFor(2) }));
      expect(windows.length).toBeGreaterThan(0);
      for (const w of windows) {
        const cards = w.map((id) => byId.get(id)!);
        expect(count(cards, isGc)).toBe(0);
        expect(count(cards, isMld)).toBe(0);
        expect(completesPair(cards)).toBe(false);
        expect(count(cards, isTurn)).toBeLessThanOrEqual(1);
      }
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("the lock tier: on with no target and at 4, off at 3 and below — a staple then ranks like any card", () => {
    expect(locksStaples(mtgAutofill, null)).toBe(true);
    expect([1, 2, 3, 4, 5].map((t) => locksStaples(mtgAutofill, t))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    // Magic's threshold is Optimized — the first bracket without a Game Changer allowance.
    const level = BRACKET_RULESET.levels.find((l) => l.level === mtgAutofill.lockMinTarget);
    expect(level?.name).toBe("Optimized");
    expect(level?.gameChangers).toBeNull();

    const staple = recs.find((r) => r.name === "Plain 1-9")!; // low in its bucket
    const lowStaple = { ...staple, score: 0.01 };
    const input = shellInput({
      pool: [...recs.filter((r) => r.cardId !== staple.cardId), lowStaple],
      tournamentContext: { commanderNames: ["Test Commander"], lists: 10, since: null },
      tournamentsByCandidate: new Map<string, TournamentSignal>([
        [staple.cardId, { lists: 9, top4: 4 }],
      ]),
    });
    const tierOf = (lockStaples: boolean) =>
      buildShell({ ...input, lockStaples }).picks.find((p) => p.cardId === staple.cardId)?.tier ??
      "absent";
    expect(tierOf(true)).toBe("locked");
    expect(tierOf(false)).toBe("absent"); // its score alone never reaches a window
  });
});

describe("WAVE4 E's acceptance: a target-2 shell reads within its target", () => {
  const FRESH: BracketFreshness = {
    readAt: "2026-10-10T12:00:00.000Z",
    feeds: {
      gameChangers: { state: "ok", asOf: "2026-10-10T04:54:15.655Z" },
      landDenial: { state: "ok", asOf: "2026-10-10T04:54:15.655Z" },
      extraTurns: { state: "ok", asOf: "2026-10-10T04:54:15.655Z" },
      combos: { state: "ok", asOf: "2026-10-10T04:55:53.189Z" },
    },
  };
  /** The read the editor's line would show: the shell padded with plain cards to a finished list. */
  function lineOf(shell: MtgCard[], targetLevel: number | null) {
    const fill = fillers(99 - shell.length);
    const main = [...shell, ...fill];
    const deck = {
      gameId: "mtg" as const,
      formatCode: "commander",
      zones: { commander: [entry(commander)], main: main.map((c) => entry(c)) },
    };
    const cards = cardMap([commander, ...main]);
    const held = new Set(main.map((c) => c.id));
    const read = brackets.assess({
      deck,
      cards,
      combos: combos.filter((c) => c.cardPieces.every((id) => held.has(id))),
      freshness: FRESH,
      targetLevel,
    });
    return { read, line: brackets.line(read, { deck, cards, progress: null, targetLevel }) };
  }
  // Extra-turn cards left out: one would be allowed at 2 and read "at least 2".
  const noTurns = recs.filter((r) => !isTurn(byId.get(r.cardId)!));

  it("the same seed without goals reads above Bracket 2; with a target of 2 it reads Bracket 1–2", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const free = picksOf(shellInput({ seed, pool: noTurns }));
      expect(lineOf(free, null).read.minimum).toBeGreaterThan(2);

      const held = picksOf(shellInput({ seed, pool: noTurns, goals: goalsFor(2) }));
      expect(lineOf(held, null).line).toBe("Bracket 1–2 · nothing here goes past Core");
      expect(lineOf(held, 2).line).toBe("Your target: Bracket 2 · nothing here goes past Core");
    }
  });

  it("with extra-turn cards in the pool, a target-2 shell never passes 2: no finding or open question above it", () => {
    for (const seed of SEEDS) {
      const { read } = lineOf(picksOf(shellInput({ seed, goals: goalsFor(2) })), 2);
      expect(read.minimum).toBeLessThanOrEqual(2);
      expect(read.conflicts).toEqual([]);
      expect(read.review.filter((q) => q.raisesTo > 2)).toEqual([]);
    }
  });
});
