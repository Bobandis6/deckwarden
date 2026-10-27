/**
 * BRACKET-UP — the planner: each card coming in, in Suggestions' order,
 * for the Cut Coach's weakest card at its cost (Swap in's partner), then
 * the weakest left at another cost; never the commander, a land (unless
 * the player picks one for a land), a complete-combo piece, a card coming
 * in, or one card twice; the player's calls winning; and what starts
 * checked under the target (the goals, row by row, over the real Magic
 * read). The end runs the whole loop: the list after the swaps keeps its
 * size and every untouched row, and its read reaches the target.
 */
import { describe, expect, it } from "vitest";

import type { EditorEntry } from "@/lib/decks/editor-state";
import { toDeckSnapshot } from "@/lib/decks/validation";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { basicLands, card, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketFreshness, CompleteCombo } from "@/lib/games/types";
import { completeCombosByCard, type CutEntryInput } from "@/lib/recommend/cuts";
import { deckSizeCount } from "@/lib/decks/editor-state";
import { fitList } from "@/lib/recommend/fit";
import { cutCombosFromFacts } from "@/lib/recommend/swap-in";

import {
  NO_UP_OVERRIDES,
  planTargetUp,
  targetUpJudge,
  targetUpSlots,
  type TargetUpOverrides,
  type TargetUpRow,
} from "./target-up";

const mtg = getAdapter("mtg");
const recommend = mtg.recommend!;
const brackets = mtg.brackets!;

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: Object.fromEntries(
    ["gameChangers", "landDenial", "extraTurns", "combos"].map((f) => [
      f,
      { state: "ok", asOf: AT },
    ]),
  ),
};

const spell = (
  name: string,
  costValue: number | null,
  popularity: number | null,
  attrs: Partial<MtgCard["attrs"]> = {},
) =>
  card({
    name,
    primaryType: "Sorcery",
    costValue,
    popularity,
    attrs: { type_line: "Sorcery", oracle_text: "", ...attrs },
  });

// A small list: the commander, three 2-drops (two fringe cards and a staple),
// a fringe 3-drop and a 3-drop that completes a combo with the commander, a
// fringe 5-drop, a 6-drop the Coach can't rank (no rank, its bucket under the
// template), and 30 Forests.
const kiki = card({
  name: "Kiki-Jiki, Mirror Breaker",
  costValue: 5,
  isLeaderCandidate: true,
  attrs: { type_line: "Legendary Creature — Goblin Shaman", oracle_text: "" },
});
const fringeTwoA = spell("Fringe Two A", 2, 40_000);
const fringeTwoB = spell("Fringe Two B", 2, 30_000);
const stapleTwo = spell("Staple Two", 2, 50);
const fringeThree = spell("Fringe Three", 3, 45_000);
const comboThree = spell("Combo Three", 3, 48_000);
const fringeFive = spell("Fringe Five", 5, 41_000);
const unrankedSix = spell("Unranked Six", 6, null);
const forest = card({
  name: "Forest",
  primaryType: "Land",
  costValue: 0,
  attrs: { type_line: "Basic Land — Forest", oracle_text: "" },
});
const SMALL = [fringeTwoA, fringeTwoB, stapleTwo, fringeThree, comboThree, fringeFive, unrankedSix];
const COMBO: CompleteCombo = {
  key: "kiki-combo",
  cardPieces: [kiki.id, comboThree.id].sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite tokens"],
  popularity: 9000,
};

function smallList() {
  const entries: EditorEntry[] = [
    { cardId: kiki.id, zone: "commander", qty: 1, tags: [] },
    ...SMALL.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: ["mine"] })),
    { cardId: forest.id, zone: "main", qty: 30, tags: [] },
  ];
  return { entries, cards: new Map([kiki, ...SMALL, forest].map((c) => [c.id, c])) };
}

/** Swap in's input over a list, as the sheet builds it. */
function cutOf(
  entries: readonly EditorEntry[],
  cards: ReadonlyMap<string, MtgCard>,
  combos: CompleteCombo[] | null = [COMBO],
) {
  const cutEntries: CutEntryInput[] = entries.map((e) => ({
    card: cards.get(e.cardId)!,
    zone: e.zone,
    qty: e.qty,
    tags: e.tags,
  }));
  return {
    meta: recommend,
    roleTargets: [],
    entries: cutEntries,
    excludedZones: new Set(["commander"]),
    completeCombosByCard: completeCombosByCard(
      cutCombosFromFacts(combos, cards),
      new Set(entries.map((e) => e.cardId)),
    ),
    zone: "main",
  };
}

interface Row extends TargetUpRow {
  card: MtgCard;
}
const rowOf = (c: MtgCard): Row => ({ cardId: c.id, name: c.name, card: c });

const inTwoA = spell("In Two A", 2, 10);
const inTwoB = spell("In Two B", 2, 11);
const inTwoC = spell("In Two C", 2, 12);
const inTwoD = spell("In Two D", 2, 13);
const inLand = card({
  name: "In Land",
  primaryType: "Land",
  costValue: 0,
  attrs: { type_line: "Land", oracle_text: "" },
});
const inThree = spell("In Three", 3, 14);
const ROWS = [inTwoA, inTwoB, inTwoC, inTwoD, inLand, inThree].map(rowOf);

function smallPlan(overrides: TargetUpOverrides = NO_UP_OVERRIDES, rows = ROWS) {
  const { entries, cards } = smallList();
  const slots = targetUpSlots({ rows, cut: cutOf(entries, cards) });
  return { slots, plan: planTargetUp({ slots, zone: "main", overrides }) };
}
const outName = (p: { out: { name: string } | null }) => p.out?.name ?? null;
const overrides = (o: Partial<TargetUpOverrides>): TargetUpOverrides => ({
  ...NO_UP_OVERRIDES,
  ...o,
});

describe("planTargetUp — the card each one replaces", () => {
  it("rank order takes the weakest card at its cost, then the weakest left at another cost; a land is unpaired", () => {
    const { plan } = smallPlan();
    expect(plan.pairs.map((p) => [p.row.name, outName(p), p.via])).toEqual([
      ["In Two A", "Fringe Two A", "bucket"],
      ["In Two B", "Fringe Two B", "bucket"],
      // An ordinary cut is any card the Coach ranks: a staple too, once the fringe ones are gone.
      ["In Two C", "Staple Two", "bucket"],
      // Every row has its own bucket first: In Three keeps Fringe Three, In Two D takes the next.
      ["In Two D", "Fringe Five", "elsewhere"],
      ["In Land", null, null],
      ["In Three", "Fringe Three", "bucket"],
    ]);
    expect(plan.pairs[4]).toMatchObject({ unpaired: "no-bucket", bucketWords: null });
    expect(plan.pairs[0].bucketWords).toBe("2");
    expect(plan.pairs.map((p) => p.checked)).toEqual([true, true, true, true, false, true]);
    expect(plan.swaps).toEqual(
      [
        [fringeTwoA, inTwoA],
        [fringeTwoB, inTwoB],
        [stapleTwo, inTwoC],
        [fringeFive, inTwoD],
        [fringeThree, inThree],
      ].map(([out, inc]) => ({ outId: out.id, inId: inc.id, zone: "main" })),
    );
  });

  it("never the commander, a land, a complete-combo piece or a card the Coach can't rank; no card twice", () => {
    const more = [3, 3, 3, 5, 5, 6, 6].map((mv, i) => rowOf(spell(`More ${i}`, mv, 20 + i)));
    const { plan } = smallPlan(NO_UP_OVERRIDES, [...ROWS, ...more]);
    const outs = plan.pairs.flatMap((p) => (p.out ? [p.out.cardId] : []));
    expect(new Set(outs).size).toBe(outs.length);
    for (const id of [kiki.id, forest.id, comboThree.id, unrankedSix.id]) {
      expect(outs).not.toContain(id);
    }
    // Five ordinary cuts in the list, five rows paired. Every row's own bucket comes first:
    // More 3 (a 5-drop) takes Fringe Five, so In Two D has none left anywhere.
    expect(outs).toHaveLength(5);
    expect([outName(plan.pairs[9]), plan.pairs[9].via]).toEqual(["Fringe Five", "bucket"]);
    expect(plan.pairs.filter((p) => p.unpaired === "no-cut").map((p) => p.row.name)).toEqual([
      "In Two D",
      ...more.filter((_, i) => i !== 3).map((r) => r.name),
    ]);
    expect(plan.pairs.filter((p) => p.unpaired === "no-cut").every((p) => !p.checked)).toBe(true);
  });

  it("the chooser: its bucket, then the rest in the Coach's order; never a combo piece; a land only for a land", () => {
    const { plan } = smallPlan();
    const names = (i: number, same: boolean) =>
      plan.pairs[i].choices.filter((c) => c.sameBucket === same).map((c) => c.option.name);
    expect(names(0, true)).toEqual(["Fringe Two A", "Fringe Two B", "Staple Two"]);
    // The rest: ranked first, the unranked by name after; no Forest, no combo piece.
    expect(names(0, false)).toEqual(["Fringe Three", "Fringe Five", "Unranked Six"]);
    // The land's chooser offers every card in the zone, Forests included, never the combo piece.
    expect(names(4, true)).toEqual([]);
    expect(names(4, false).sort()).toEqual(
      [
        "Fringe Two A",
        "Fringe Two B",
        "Staple Two",
        "Fringe Three",
        "Fringe Five",
        "Unranked Six",
        "Forest",
      ].sort(),
    );
    // Who holds what: another row's card names that row; the row's own card holds none.
    const held = plan.pairs[0].choices.find((c) => c.option.cardId === fringeTwoB.id)!;
    expect(held).toMatchObject({ heldBy: inTwoB.id, byPick: false });
    const own = plan.pairs[0].choices.find((c) => c.option.cardId === fringeTwoA.id)!;
    expect(own.heldBy).toBeNull();
  });

  it("with no combo facts nothing is protected, and the chooser says nothing more than the Coach", () => {
    const { entries, cards } = smallList();
    const slots = targetUpSlots({ rows: ROWS, cut: cutOf(entries, cards, null) });
    const plan = planTargetUp({ slots, zone: "main" });
    // Combo Three is now the fringiest 3-drop.
    expect(outName(plan.pairs[5])).toBe("Combo Three");
  });
});

describe("planTargetUp — the player's calls win", () => {
  it("unchecking a row keeps its card (no other row moves) and drops it from the swaps", () => {
    const { plan } = smallPlan(overrides({ unchecked: new Set([inTwoA.id]) }));
    expect(plan.pairs[0]).toMatchObject({ checked: false, via: "bucket" });
    expect(outName(plan.pairs[0])).toBe("Fringe Two A");
    expect(outName(plan.pairs[1])).toBe("Fringe Two B");
    expect(plan.swaps.map((s) => s.inId)).not.toContain(inTwoA.id);
  });

  it("choosing another card in the bucket takes it; the row that held it is planned again", () => {
    const { plan } = smallPlan(overrides({ picks: new Map([[inTwoA.id, fringeTwoB.id]]) }));
    expect(plan.pairs.slice(0, 4).map((p) => [outName(p), p.via])).toEqual([
      ["Fringe Two B", "pick"],
      ["Fringe Two A", "bucket"],
      ["Staple Two", "bucket"],
      ["Fringe Five", "elsewhere"],
    ]);
    // A card a choice holds can't be taken by another row's chooser.
    const taken = plan.pairs[1].choices.find((c) => c.option.cardId === fringeTwoB.id)!;
    expect(taken).toMatchObject({ heldBy: inTwoA.id, byPick: true });
  });

  it("choosing from the rest, or a card the Coach can't rank: the player's call, still never twice", () => {
    const { plan } = smallPlan(
      overrides({
        picks: new Map([
          [inTwoA.id, unrankedSix.id],
          [inTwoB.id, unrankedSix.id],
        ]),
      }),
    );
    expect([outName(plan.pairs[0]), plan.pairs[0].via]).toEqual(["Unranked Six", "pick"]);
    // The second choice of the same card loses to the first, so its row takes its own partner.
    expect([outName(plan.pairs[1]), plan.pairs[1].via]).toEqual(["Fringe Two A", "bucket"]);
  });

  it("an unpaired land: choosing a Forest pairs it, and the choice checks it", () => {
    const { plan } = smallPlan(
      overrides({ picks: new Map([[inLand.id, forest.id]]), checked: new Set([inLand.id]) }),
    );
    expect(plan.pairs[4]).toMatchObject({ unpaired: null, via: "pick", checked: true });
    expect(outName(plan.pairs[4])).toBe("Forest");
    expect(plan.swaps.find((s) => s.inId === inLand.id)).toEqual({
      outId: forest.id,
      inId: inLand.id,
      zone: "main",
    });
  });

  it("a choice outside the chooser (a combo piece, a land for a spell) is never taken", () => {
    const { plan } = smallPlan(
      overrides({
        picks: new Map([
          [inTwoA.id, comboThree.id],
          [inTwoB.id, forest.id],
          [inTwoC.id, kiki.id],
        ]),
      }),
    );
    expect(plan.pairs.slice(0, 3).map(outName)).toEqual([
      "Fringe Two A",
      "Fringe Two B",
      "Staple Two",
    ]);
    expect(plan.pairs.slice(0, 3).every((p) => p.via === "bucket")).toBe(true);
  });
});

// --- The goals, row by row, over the real Magic read ---------------------------------------

/** A 100-card list: the commander, 36 Forests, and 63 ranked fringe spells across the curve. */
function fullList() {
  const lands = basicLands(36);
  const fringe = Array.from({ length: 63 }, (_, i) =>
    spell(`Fringe ${i + 1}`, (i % 6) + 1, 30_000 + i),
  );
  const entries: EditorEntry[] = [
    { cardId: kiki.id, zone: "commander", qty: 1, tags: [] },
    ...[...lands, ...fringe].map((c) => ({
      cardId: c.id,
      zone: "main",
      qty: 1,
      tags: ["mine"],
      printingId: `${c.id}-printing`,
    })),
  ];
  return { entries, cards: new Map([kiki, ...lands, ...fringe].map((c) => [c.id, c])) };
}

const changers = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((n) =>
  rowOf(spell(`${n} Changer`, 2, 5, { game_changer: true })),
);

function judgedPlan(o: TargetUpOverrides = NO_UP_OVERRIDES, targetLevel = 3) {
  const { entries, cards } = fullList();
  const all = new Map<string, MtgCard>(cards);
  for (const r of changers) all.set(r.cardId, r.card);
  const slots = targetUpSlots({ rows: changers, cut: cutOf(entries, cards, []) });
  const judge = targetUpJudge<Row>({
    brackets,
    game: "mtg",
    format: COMMANDER,
    entries,
    cards: all,
    combos: [],
    freshness: FRESH,
    goals: { v: 1, targetLevel },
  });
  return { entries, all, plan: planTargetUp({ slots, zone: "main", overrides: o, judge }) };
}

describe("planTargetUp — what starts checked under the target", () => {
  it("each Game Changer is fine alone; past the third, the goals leave the rest unchecked, saying why", () => {
    const { plan } = judgedPlan();
    expect(plan.pairs.map((p) => p.checked)).toEqual([true, true, true, false, false]);
    expect(plan.pairs[3].above).toEqual([
      "A fourth Game Changer (Wizards' list). Your Bracket 3 target allows up to three",
    ]);
    // The fifth sits after the same three: it would be the fourth too.
    expect(plan.pairs[4].above).toEqual(plan.pairs[3].above);
    // Every row keeps its card either way.
    expect(plan.pairs.every((p) => p.out !== null)).toBe(true);
  });

  it("live: unchecking a Game Changer above lets the next one in; the player's own check wins", () => {
    const { plan } = judgedPlan(overrides({ unchecked: new Set([changers[0].cardId]) }));
    expect(plan.pairs.map((p) => p.checked)).toEqual([false, true, true, true, false]);
    expect(plan.pairs[3].above).toEqual([]);
    const forced = judgedPlan(overrides({ checked: new Set([changers[4].cardId]) })).plan;
    expect(forced.pairs.map((p) => p.checked)).toEqual([true, true, true, false, true]);
    // The reason stays beside it: the after-check names the conflict.
    expect(forced.pairs[4].above).toHaveLength(1);
  });

  it("at a target of 4 nothing holds the Game Changers back", () => {
    const { plan } = judgedPlan(NO_UP_OVERRIDES, 4);
    expect(plan.pairs.every((p) => p.checked && p.above.length === 0)).toBe(true);
  });

  it("no target, no judge", () => {
    const { entries, cards } = fullList();
    expect(
      targetUpJudge({
        brackets,
        game: "mtg",
        format: COMMANDER,
        entries,
        cards,
        combos: [],
        freshness: FRESH,
        goals: { v: 1 },
      }),
    ).toBeUndefined();
  });

  it("the whole loop: the list after keeps its size and every untouched row, and its read reaches the target", () => {
    const { entries, all, plan } = judgedPlan();
    const after = fitList(entries, COMMANDER, plan.swaps);
    expect(deckSizeCount(after, COMMANDER)).toBe(deckSizeCount(entries, COMMANDER));
    const outs = new Set(plan.swaps.map((s) => s.outId));
    for (const e of entries) {
      if (outs.has(e.cardId)) expect(after.some((a) => a.cardId === e.cardId)).toBe(false);
      else expect(after).toContain(e);
    }
    const read = brackets.assess({
      deck: toDeckSnapshot("mtg", COMMANDER, after),
      cards: all,
      combos: [],
      freshness: FRESH,
      targetLevel: 3,
      answers: null,
    });
    expect([read.minimum, read.conflicts]).toEqual([3, []]);
    const before = brackets.assess({
      deck: toDeckSnapshot("mtg", COMMANDER, entries),
      cards: all,
      combos: [],
      freshness: FRESH,
      targetLevel: 3,
      answers: null,
    });
    expect(before.minimum).toBe(1);
  });
});
