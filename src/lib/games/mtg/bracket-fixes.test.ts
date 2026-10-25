/**
 * BRACKET-FIT — Magic's `fixes` pinned against the real `assessBracket`: on
 * fixture lists at targets 1, 2 and 3, taking any `remove` cards of every
 * fix's `from` out (each replaced by a card with no flags, as a swap does)
 * leaves no conflict, and taking one fewer from any fix leaves its factor
 * above the target. A commander is never in `from`: a Game Changer
 * commander keeps its part of the count, and a combo of commanders alone
 * has nothing to take.
 */
import { describe, expect, it } from "vitest";

import type { BracketFix, BracketFreshness, CompleteCombo, DeckSnapshot } from "../types";
import { mtgBrackets } from "./brackets";
import {
  basicLands,
  card,
  cardMap,
  commanderDeck,
  entry,
  fillers,
  thrasios,
  tymna,
  type MtgCard,
} from "./test-fixtures";

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: AT },
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT },
  },
};

const named = (name: string, attrs: Partial<MtgCard["attrs"]> = {}, over: Partial<MtgCard> = {}) =>
  card({ ...over, name, attrs: { type_line: "Creature — Test", oracle_text: "", ...attrs } });

const kiki = named("Kiki-Jiki, Mirror Breaker", {}, { isLeaderCandidate: true });
const urza = named(
  "Urza, Lord High Artificer",
  { game_changer: true },
  { isLeaderCandidate: true },
);
const conscripts = named("Zealous Conscripts");
const rhystic = named("Rhystic Study", { game_changer: true });
const rift = named("Cyclonic Rift", { game_changer: true });
const tutor = named("Demonic Tutor", { game_changer: true });
const tithe = named("Smothering Tithe", { game_changer: true });
const thoracle = named("Thassa's Oracle", { game_changer: true });
const consultation = named("Demonic Consultation");
const armageddon = named("Armageddon", { mld: "clear" });
const ravages = named("Ravages of War", { mld: "clear" });
const timeWarp = named("Time Warp", { extra_turn: true });
const temporal = named("Temporal Manipulation", { extra_turn: true });
const [rA, rB, rC] = ["Lock Piece A", "Lock Piece B", "Lock Piece C"].map((n) => named(n));
const [cA, cB] = ["Loop Piece A", "Loop Piece B"].map((n) => named(n));

const combo = (
  key: string,
  pieces: MtgCard[],
  over: Partial<CompleteCombo> = {},
): CompleteCombo => ({
  key,
  cardPieces: pieces.map((c) => c.id).sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite damage"],
  popularity: 100,
  ...over,
});
/** Two-card with your commander: at least 3. */
const KIKI = combo("kiki", [kiki, conscripts]);
/** Two-card, a Game Changer among its pieces: at least 3. */
const ORACLE = combo("oracle", [thoracle, consultation]);
/** Three cards Spellbook rates R: at least 4. */
const LOCK = combo("lock", [rA, rB, rC], { tag: "R", relevant: false });
/** Three cards Spellbook rates C, not two-card: at least 2. */
const LOOP = combo("loop", [cA, cB, rhystic], { relevant: false });

interface List {
  deck: DeckSnapshot;
  cards: Map<string, MtgCard>;
  combos: CompleteCombo[];
}

/** The commanders, the specials, 36 lands, fillers to 100. */
function list(commanders: MtgCard[], specials: MtgCard[], combos: CompleteCombo[]): List {
  const main = [
    ...specials,
    ...basicLands(36),
    ...fillers(100 - commanders.length - specials.length - 36),
  ];
  return {
    deck: commanderDeck(
      commanders,
      main.map((c) => entry(c)),
    ),
    cards: cardMap([...commanders, ...main]),
    combos,
  };
}

const read = (l: List, target: number | null) =>
  mtgBrackets.assess({
    deck: l.deck,
    cards: l.cards,
    combos: l.combos,
    freshness: FRESH,
    targetLevel: target,
  });
const fixesOf = (l: List, target: number | null) => {
  const r = read(l, target);
  return mtgBrackets.fixes!(r, {
    deck: l.deck,
    cards: l.cards,
    combos: l.combos,
    freshness: FRESH,
    targetLevel: target,
  });
};

/** The list with `out` swapped, each for a fresh card that carries no flag and completes no combo. */
function without(l: List, out: ReadonlySet<string>): List {
  const cards = new Map(l.cards);
  const main = l.deck.zones.main.map((e) => {
    if (!out.has(e.cardId)) return e;
    const stand = card({ name: `Stand-in for ${l.cards.get(e.cardId)!.name}` });
    cards.set(stand.id, stand);
    return { ...e, cardId: stand.id };
  });
  return { ...l, deck: { ...l.deck, zones: { ...l.deck.zones, main } }, cards };
}

/** Every way to choose `k` of `items`. */
function choose<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  return [...choose(rest, k - 1).map((c) => [head, ...c]), ...choose(rest, k)];
}
/** Every pick of one choice per fix. */
function product<T>(lists: readonly T[][]): T[][] {
  return lists.reduce<T[][]>((acc, l) => acc.flatMap((a) => l.map((x) => [...a, x])), [[]]);
}

const EVERYTHING = list(
  [kiki],
  [
    conscripts,
    rhystic,
    rift,
    tutor,
    tithe,
    thoracle,
    consultation,
    armageddon,
    ravages,
    timeWarp,
    temporal,
    rA,
    rB,
    rC,
    cA,
    cB,
  ],
  [KIKI, ORACLE, LOCK, LOOP],
);

describe("mtgBrackets.fixes — the read's counts, said as cards to take out", () => {
  it("one fix per conflict, in the read's order, with the target's own counts", () => {
    const at = (target: number) => ({
      read: read(EVERYTHING, target),
      fixes: fixesOf(EVERYTHING, target),
    });
    const t1 = at(1);
    expect(t1.fixes.map((f) => f.factor)).toEqual(t1.read.conflicts);
    const byFactor = (fixes: BracketFix[]) => new Map(fixes.map((f) => [f.factor, f]));
    const one = byFactor(t1.fixes);
    // Five Game Changers and none allowed at 1: all five.
    expect(one.get("game-changers")).toEqual({
      factor: "game-changers",
      remove: 5,
      from: [rift, tutor, rhystic, tithe, thoracle].map((c) => c.id),
    });
    expect(one.get("land-denial")).toEqual({
      factor: "land-denial",
      remove: 2,
      from: [armageddon.id, ravages.id],
    });
    expect(one.get("extra-turns")).toEqual({
      factor: "extra-turns",
      remove: 2,
      from: [temporal.id, timeWarp.id],
    });
    // A combo: one piece that isn't the commander.
    expect(one.get("combo:kiki")).toEqual({
      factor: "combo:kiki",
      remove: 1,
      from: [conscripts.id],
    });
    expect(one.get("combo:oracle")?.from).toEqual([consultation.id, thoracle.id]);
    expect(one.get("combo:loop")?.from).toEqual([cA.id, cB.id, rhystic.id]);
    expect(one.get("combo:lock")?.from).toEqual([rA.id, rB.id, rC.id]);

    const t2 = byFactor(at(2).fixes);
    // Extra turns are allowed at 2, and so is a combo Spellbook rates 2.
    expect([...t2.keys()].sort()).toEqual(
      ["combo:kiki", "combo:oracle", "combo:lock", "game-changers", "land-denial"].sort(),
    );
    expect(t2.get("game-changers")?.remove).toBe(5);

    const t3 = byFactor(at(3).fixes);
    // Three allowed at 3: two of the five; two-card combos are allowed (late) at 3.
    expect([...t3.keys()].sort()).toEqual(["combo:lock", "game-changers", "land-denial"]);
    expect(t3.get("game-changers")?.remove).toBe(2);
  });

  it("no target, or nothing above it, needs nothing; nothing reads above 4", () => {
    expect(fixesOf(EVERYTHING, null)).toEqual([]);
    expect(fixesOf(EVERYTHING, 4)).toEqual([]);
    expect(fixesOf(EVERYTHING, 5)).toEqual([]);
    expect(fixesOf(list([kiki], [rhystic], []), 3)).toEqual([]);
  });

  it.each([1, 2, 3])(
    "target %i: taking any `remove` of every fix out leaves no conflict; one fewer from any fix leaves its factor",
    (target) => {
      const fixes = fixesOf(EVERYTHING, target);
      expect(fixes.length).toBeGreaterThan(0);
      // Every way to meet every fix together.
      const ways = product(fixes.map((f) => choose(f.from, f.remove)));
      expect(ways.length).toBeGreaterThan(0);
      for (const way of ways) {
        const out = new Set(way.flat());
        expect(read(without(EVERYTHING, out), target).conflicts).toEqual([]);
      }
      // One fewer from a fix, the others met from cards outside it: that factor stays.
      for (const fix of fixes) {
        const others = fixes.filter((f) => f !== fix);
        const outside = product(
          others.map((f) =>
            choose(
              f.from.filter((id) => !fix.from.includes(id)),
              f.remove,
            ),
          ),
        );
        if (outside.length === 0) continue;
        for (const short of choose(fix.from, fix.remove - 1)) {
          const out = new Set([...outside[0].flat(), ...short]);
          expect(read(without(EVERYTHING, out), target).conflicts).toContain(fix.factor);
        }
      }
    },
  );

  it("a Game Changer commander keeps its part of the count: it is never in `from`", () => {
    const l = list([urza], [rhystic, rift], []);
    const [gc] = fixesOf(l, 2);
    expect(gc).toEqual({ factor: "game-changers", remove: 3, from: [rift.id, rhystic.id] });
    // Both spells out, the commander's Game Changer still puts it above 2.
    expect(read(without(l, new Set(gc.from)), 2).conflicts).toEqual(["game-changers"]);
    // At 3 the commander fits the allowance with the other two: nothing to take.
    expect(fixesOf(l, 3)).toEqual([]);
  });

  it("a combo of your commanders alone has nothing to take", () => {
    const pair = combo("pair", [thrasios, tymna]);
    const l = list([thrasios, tymna], [], [pair]);
    expect(read(l, 2).conflicts).toEqual(["combo:pair"]);
    expect(fixesOf(l, 2)).toEqual([{ factor: "combo:pair", remove: 1, from: [] }]);
  });

  it("copies count where the read counts them: two copies of a Game Changer are two", () => {
    const l = list([kiki], [], []);
    l.deck.zones.main.splice(0, 1, entry(rhystic, 2));
    l.cards.set(rhystic.id, rhystic);
    const [gc] = fixesOf(l, 2);
    expect(gc).toEqual({ factor: "game-changers", remove: 2, from: [rhystic.id] });
  });
});
