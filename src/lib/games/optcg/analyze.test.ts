/**
 * P4.3 — OP dashboard against hand-computed fixtures (P1.5's bar). Card
 * texts are real corpus texts (verified 2026-09-04): ST01-006 Chopper is the
 * pinned blocker positive, ST01-002 Usopp the pinned negative, OP01-009
 * Carrot the folded-trigger quirk. Hypergeometric pins are worked by hand in
 * comments — if one fails, suspect the code, not the pin.
 */
import { describe, expect, it } from "vitest";

import type { AnalyticsBlock, CardData, DeckEntry, DeckSnapshot } from "../types";
import { optcgAdapter, type OptcgAttrs } from "./adapter";
import { analyzeOptcg, isBlocker, matchesTarget, pAtLeastOne, parseSearcher } from "./analyze";

type OptcgCard = CardData<OptcgAttrs>;

let n = 0;

function card(over: Partial<OptcgCard> & { name: string; attrs?: Partial<OptcgAttrs> }): OptcgCard {
  const seq = ++n;
  const attrs: OptcgAttrs = {
    category: "character",
    type_line: "Character — Test",
    oracle_text: "",
    ...over.attrs,
  };
  return {
    id: over.id ?? `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    externalKey: over.externalKey ?? `OP99-${String(seq).padStart(3, "0")}`,
    primaryType: "Character",
    costValue: 2,
    colorsMask: 8, // Red
    ciMask: 8,
    isLeaderCandidate: false,
    isPreview: false,
    cheapestUsd: null,
    popularity: null,
    legality: [],
    ...over,
    attrs,
  };
}

const entry = (c: OptcgCard, qty = 1): DeckEntry => ({ cardId: c.id, qty, tags: [] });

function snapshot(main: DeckEntry[], leader: DeckEntry[] = []): DeckSnapshot {
  return { gameId: "optcg", formatCode: "standard", zones: { leader, main } };
}

function cardMap(cards: OptcgCard[]): ReadonlyMap<string, OptcgCard> {
  return new Map(cards.map((c) => [c.id, c]));
}

function block(blocks: AnalyticsBlock[], id: string): AnalyticsBlock {
  const b = blocks.find((x) => x.id === id);
  if (!b) throw new Error(`missing block ${id}`);
  return b;
}

// Real corpus texts.
const CHOPPER_TEXT =
  "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)";
const USOPP_TEXT =
  "[DON!! x2] [When Attacking] Your opponent cannot activate a [Blocker] Character that has 5000 or more power during this battle.";
const IZO_GRANT_TEXT = "[DON!! x2] This Character gains [Blocker]. [On Play] Your text here.";
const UTA_MID_TEXT =
  "[On Play] If your opponent has a Character with 5000 power or more, give this card in your hand −4 cost. [Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)";
const SEARCHER_TEXT =
  "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Supernovas} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.";

describe("isBlocker (rule measured corpus-wide: 282 of 374 substring hits)", () => {
  it("accepts the plain printed keyword (ST01-006 Chopper)", () => {
    expect(isBlocker(CHOPPER_TEXT)).toBe(true);
  });
  it("rejects references to blockers (ST01-002 Usopp)", () => {
    expect(isBlocker(USOPP_TEXT)).toBe(false);
  });
  it("rejects conditional grants (ST28-002 Izo shape)", () => {
    expect(isBlocker(IZO_GRANT_TEXT)).toBe(false);
  });
  it("accepts sentence-start occurrences after other text (ST23-001 Uta shape)", () => {
    expect(isBlocker(UTA_MID_TEXT)).toBe(true);
  });
  it("accepts the keyword after other bracketed keywords (EB04-038 shape)", () => {
    expect(isBlocker("[Blocker] [On Play] Draw 1 card.")).toBe(true);
  });
});

describe("parseSearcher / matchesTarget", () => {
  const supernova = card({ name: "Kid", attrs: { traits: ["Supernovas"] } });
  const plain = card({ name: "Filler" });

  it("parses the canonical trait searcher (ST02-007 shape)", () => {
    const parsed = parseSearcher(SEARCHER_TEXT);
    expect(parsed).not.toBeNull();
    expect(parsed!.look).toBe(5);
    expect(matchesTarget(supernova, parsed!.filter)).toBe(true);
    expect(matchesTarget(plain, parsed!.filter)).toBe(false);
  });

  it("honors 'other than' exclusions (OP01-016 shape)", () => {
    const parsed = parseSearcher(
      "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew} type card other than [Nami] and add it to your hand.",
    )!;
    const nami = card({ name: "Nami", attrs: { traits: ["Straw Hat Crew"] } });
    const zoro = card({ name: "Roronoa Zoro", attrs: { traits: ["Straw Hat Crew"] } });
    expect(matchesTarget(nami, parsed.filter)).toBe(false);
    expect(matchesTarget(zoro, parsed.filter)).toBe(true);
  });

  it("ANDs color with trait (OP02-083 shape)", () => {
    const parsed = parseSearcher(
      "Look at 5 cards from the top of your deck; reveal up to 1 purple {Impel Down} type card and add it to your hand.",
    )!;
    const purple = card({ name: "A", colorsMask: 32, attrs: { traits: ["Impel Down"] } });
    const red = card({ name: "B", colorsMask: 8, attrs: { traits: ["Impel Down"] } });
    expect(matchesTarget(purple, parsed.filter)).toBe(true);
    expect(matchesTarget(red, parsed.filter)).toBe(false);
  });

  it("matches quoted type-including as a trait substring (OP02-022 shape)", () => {
    const parsed = parseSearcher(
      'Look at 5 cards from the top of your deck; reveal up to 1 Character card with a type including "Whitebeard Pirates" and add it to your hand.',
    )!;
    const ally = card({ name: "A", attrs: { traits: ["Whitebeard Pirates Allies"] } });
    const navy = card({ name: "B", attrs: { traits: ["Navy"] } });
    const event = card({
      name: "C",
      attrs: { category: "event", traits: ["Whitebeard Pirates"] },
    });
    expect(matchesTarget(ally, parsed.filter)).toBe(true);
    expect(matchesTarget(navy, parsed.filter)).toBe(false);
    expect(matchesTarget(event, parsed.filter)).toBe(false); // Character card required
  });

  it("pools multiple names under one cost cap (ST13-013 shape)", () => {
    const parsed = parseSearcher(
      "Look at 5 cards from the top of your deck; reveal up to 1 [Sabo], [Portgas.D.Ace], or [Monkey.D.Luffy] with a cost of 5 or less and add it to your hand.",
    )!;
    const sabo5 = card({ name: "Sabo", costValue: 5 });
    const sabo7 = card({ name: "Sabo", costValue: 7 });
    const luffy = card({ name: "Monkey.D.Luffy", costValue: 3 });
    const nami = card({ name: "Nami", costValue: 2 });
    expect(matchesTarget(sabo5, parsed.filter)).toBe(true);
    expect(matchesTarget(sabo7, parsed.filter)).toBe(false);
    expect(matchesTarget(luffy, parsed.filter)).toBe(true);
    expect(matchesTarget(nami, parsed.filter)).toBe(false);
  });

  it("supports [Trigger] targets (OP09-102 shape)", () => {
    const parsed = parseSearcher(
      "Look at 3 cards from the top of your deck; reveal up to 1 card with a [Trigger] and add it to your hand.",
    )!;
    const withTrigger = card({ name: "A", attrs: { trigger_text: "[Trigger] Draw 1 card." } });
    expect(matchesTarget(withTrigger, parsed.filter)).toBe(true);
    expect(matchesTarget(plain, parsed.filter)).toBe(false);
  });

  it("supports cost ranges (EB03-060 shape) and the comma variant (OP16-067 shape)", () => {
    const range = parseSearcher(
      "Look at 5 cards from the top of your deck; reveal up to 1 card with a cost of 2 to 8 and add it to your hand.",
    )!;
    expect(matchesTarget(card({ name: "A", costValue: 5 }), range.filter)).toBe(true);
    expect(matchesTarget(card({ name: "B", costValue: 9 }), range.filter)).toBe(false);
    const comma = parseSearcher(
      "Look at 5 cards from the top of your deck; reveal up to 1 {Navy} type card, add it to your hand and place the rest at the bottom of your deck.",
    );
    expect(comma).not.toBeNull();
    expect(matchesTarget(card({ name: "C", attrs: { traits: ["Navy"] } }), comma!.filter)).toBe(
      true,
    );
  });

  it("parses 'a total of up to 2' name pools (OP04-046 shape)", () => {
    const parsed = parseSearcher(
      "Look at 5 cards from the top of your deck; reveal a total of up to 2 [Plague Rounds] or [Ice Oni] cards and add them to your hand.",
    );
    expect(parsed).not.toBeNull();
    expect(matchesTarget(card({ name: "Ice Oni" }), parsed!.filter)).toBe(true);
    expect(matchesTarget(plain, parsed!.filter)).toBe(false);
  });

  it("rejects clause disjunctions rather than mis-modeling them (OP12-017 shape)", () => {
    expect(
      parseSearcher(
        "Look at 4 cards from the top of your deck; reveal up to 1 red Event or up to 1 Character card with a cost of 3 or more and add it to your hand.",
      ),
    ).toBeNull();
  });

  it("rejects top-deck rearrangers that never search (OP01-073 shape)", () => {
    expect(
      parseSearcher(
        "Look at 5 cards from the top of your deck and place them at the top or bottom of the deck in any order.",
      ),
    ).toBeNull();
  });
});

describe("pAtLeastOne", () => {
  it("matches hand-computed hypergeometric values", () => {
    // C(37,5)/C(49,5) = 435897/1906884 = 0.2285912 → P = 0.7714088
    expect(pAtLeastOne(49, 12, 5)).toBeCloseTo(0.771409, 5);
    // C(45,5)/C(49,5) = 1221759/1906884 = 0.640710 → P = 0.359290
    expect(pAtLeastOne(49, 4, 5)).toBeCloseTo(0.35929, 5);
    // C(6,5)/C(8,5) = 6/56 → P = 50/56 = 0.892857
    expect(pAtLeastOne(8, 2, 5)).toBeCloseTo(0.892857, 5);
  });
  it("handles degenerate inputs", () => {
    expect(pAtLeastOne(49, 0, 5)).toBe(0);
    expect(pAtLeastOne(0, 0, 5)).toBe(0);
    expect(pAtLeastOne(3, 3, 5)).toBe(1); // all cards are hits
    expect(pAtLeastOne(4, 2, 4)).toBe(1); // draws ≥ misses
  });
});

describe("analyzeOptcg", () => {
  const leader = card({
    name: "Monkey.D.Luffy",
    externalKey: "OP01-001",
    primaryType: "Leader",
    costValue: null,
    isLeaderCandidate: true,
    attrs: { category: "leader", life: 5, oracle_text: CHOPPER_TEXT }, // leader text must not leak into main counts
  });

  const a = card({
    name: "Blocker Trigger 1K",
    costValue: 1,
    attrs: { counter_num: 1000, trigger_text: "[Trigger] Draw 1 card.", oracle_text: CHOPPER_TEXT },
  });
  const b = card({
    name: "Grant 2K",
    costValue: 2,
    attrs: { counter_num: 2000, oracle_text: IZO_GRANT_TEXT },
  });
  const c = card({ name: "Usopp", costValue: 8, attrs: { oracle_text: USOPP_TEXT } });
  const d = card({
    name: "Uta",
    costValue: 10,
    attrs: { counter_num: 1000, oracle_text: UTA_MID_TEXT },
  });
  const e = card({
    name: "Gum-Gum Rain",
    costValue: null,
    attrs: {
      category: "event",
      oracle_text:
        "[Counter] You may trash 1 card from your hand: Up to 1 of your Leader or Character cards gains +3000 power during this battle.",
    },
  });
  const f = card({
    name: "Carrot",
    costValue: 1,
    attrs: { oracle_text: "[Trigger] Play this card." },
  });
  const g = card({ name: "Village", costValue: 3, attrs: { category: "stage" } });

  const cards = [leader, a, b, c, d, e, f, g];
  const deck = snapshot(
    [entry(a, 4), entry(b, 2), entry(c, 1), entry(d, 1), entry(e, 2), entry(f, 1), entry(g, 1)],
    [entry(leader)],
  );
  const blocks = analyzeOptcg(deck, cardMap(cards));

  it("emits the frozen block set, data kinds only, and no price stat", () => {
    expect(blocks.map((x) => x.id)).toEqual([
      "don-curve",
      "counter-1k",
      "counter-2k",
      "counter-total",
      "no-counter",
      "blockers",
      "trigger-density",
      "categories",
      "searchers",
    ]);
    for (const x of blocks) expect(["histogram", "breakdown", "stat", "table"]).toContain(x.kind);
  });

  it("buckets the DON!! curve with '–' for alt-cost events and 8+ folded", () => {
    const curve = block(blocks, "don-curve");
    if (curve.kind !== "histogram") throw new Error("wrong kind");
    expect(curve.buckets.map((x) => x.label)).toEqual([
      "–",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8+",
    ]);
    // "–": 2× Gum-Gum Rain; 1: 4×a + Carrot; 2: 2×b; 3: stage; 8+: Usopp(8) + Uta(10).
    expect(curve.buckets.map((x) => x.value)).toEqual([2, 5, 2, 1, 0, 0, 0, 0, 2]);
  });

  it("counts counters by denomination, sums them, and counts counterless characters only", () => {
    expect(block(blocks, "counter-1k")).toMatchObject({ value: "5" }); // 4×a + Uta
    expect(block(blocks, "counter-2k")).toMatchObject({ value: "2" });
    expect(block(blocks, "counter-total")).toMatchObject({ value: "+9,000" });
    // Usopp + Carrot; the event and stage are not "counterless characters".
    expect(block(blocks, "no-counter")).toMatchObject({ value: "2" });
  });

  it("counts blockers by the inherent-keyword rule, qty-weighted", () => {
    expect(block(blocks, "blockers")).toMatchObject({ value: "5" }); // 4×a + Uta; grant and reference excluded
  });

  it("counts triggers including the folded Carrot quirk, with an honest density hint", () => {
    // 4×a (trigger_text) + Carrot (oracle_text fold) over the 12 cards actually present.
    expect(block(blocks, "trigger-density")).toMatchObject({ value: "5", hint: "42% of 12 cards" });
  });

  it("breaks down categories over the main deck only", () => {
    const categories = block(blocks, "categories");
    if (categories.kind !== "breakdown") throw new Error("wrong kind");
    expect(categories.slices).toEqual([
      { label: "Characters", value: 9 },
      { label: "Events", value: 2 },
      { label: "Stages", value: 1 },
    ]);
  });

  it("emits every block with zero values for an empty deck", () => {
    const empty = analyzeOptcg(snapshot([]), cardMap(cards));
    expect(empty).toHaveLength(9);
    const curve = block(empty, "don-curve");
    if (curve.kind !== "histogram") throw new Error("wrong kind");
    expect(curve.buckets.every((x) => x.value === 0)).toBe(true);
    expect(block(empty, "trigger-density")).toMatchObject({ value: "0", hint: undefined });
    const table = block(empty, "searchers");
    if (table.kind !== "table") throw new Error("wrong kind");
    expect(table.rows).toEqual([]);
  });

  it("is wired through the adapter", () => {
    expect(optcgAdapter.analyze(deck, cardMap(cards)).map((x) => x.id)).toContain("don-curve");
  });
});

describe("searcher hit rates (fresh deck minus the resolving copy)", () => {
  function fillers(count: number): { cards: OptcgCard[]; entries: DeckEntry[] } {
    const cards: OptcgCard[] = [];
    const entries: DeckEntry[] = [];
    let remaining = count;
    let i = 0;
    while (remaining > 0) {
      const c = card({ name: `Filler ${i++}` });
      const qty = Math.min(4, remaining);
      cards.push(c);
      entries.push(entry(c, qty));
      remaining -= qty;
    }
    return { cards, entries };
  }

  function supernovas(copies: number): { cards: OptcgCard[]; entries: DeckEntry[] } {
    const cards: OptcgCard[] = [];
    const entries: DeckEntry[] = [];
    let remaining = copies;
    let i = 0;
    while (remaining > 0) {
      const c = card({ name: `Supernova ${i++}`, attrs: { traits: ["Supernovas"] } });
      const qty = Math.min(4, remaining);
      cards.push(c);
      entries.push(entry(c, qty));
      remaining -= qty;
    }
    return { cards, entries };
  }

  function rows(main: DeckEntry[], cards: OptcgCard[]): (string | number)[][] {
    const table = block(analyzeOptcg(snapshot(main), cardMap(cards)), "searchers");
    if (table.kind !== "table") throw new Error("wrong kind");
    return table.rows;
  }

  const scout = card({
    name: "Scout",
    attrs: { category: "event", oracle_text: SEARCHER_TEXT },
  });

  it("computes 12 targets in a 50-card deck at 77%", () => {
    const sn = supernovas(12);
    const fill = fillers(37);
    // pop 49, hits 12, draws 5: 1 − C(37,5)/C(49,5) = 0.7714 → 77.
    expect(
      rows([entry(scout), ...sn.entries, ...fill.entries], [scout, ...sn.cards, ...fill.cards]),
    ).toEqual([["Scout", 5, 12, 77]]);
  });

  it("computes 4 targets in a 50-card deck at 36%", () => {
    const sn = supernovas(4);
    const fill = fillers(45);
    // pop 49, hits 4, draws 5: 1 − C(45,5)/C(49,5) = 0.3593 → 36.
    expect(
      rows([entry(scout), ...sn.entries, ...fill.entries], [scout, ...sn.cards, ...fill.cards]),
    ).toEqual([["Scout", 5, 4, 36]]);
  });

  it("stays honest mid-build: 9 cards present → population 8", () => {
    const sn = supernovas(2);
    const fill = fillers(6);
    // pop 8, hits 2, draws 5: 1 − C(6,5)/C(8,5) = 50/56 = 0.8929 → 89.
    expect(
      rows([entry(scout), ...sn.entries, ...fill.entries], [scout, ...sn.cards, ...fill.cards]),
    ).toEqual([["Scout", 5, 2, 89]]);
  });

  it("subtracts the resolving copy when the searcher matches its own filter", () => {
    const seeker = card({
      name: "Seeker",
      attrs: { traits: ["Supernovas"], oracle_text: SEARCHER_TEXT },
    });
    const sn = supernovas(4);
    const fill = fillers(42);
    // Raw matches 4 (self) + 4 = 8; the resolving copy leaves 7 targets in 49.
    // 1 − C(42,5)/C(49,5) = 1 − 850668/1906884 = 0.553897 → 55.
    expect(
      rows(
        [entry(seeker, 4), ...sn.entries, ...fill.entries],
        [seeker, ...sn.cards, ...fill.cards],
      ),
    ).toEqual([["Seeker", 5, 7, 55]]);
  });

  it("gives unparseable searchers no row rather than a wrong one", () => {
    const weird = card({
      name: "Weird",
      attrs: {
        category: "event",
        oracle_text:
          "[Main] Look at 4 cards from the top of your deck; reveal up to 1 red Event or up to 1 Character card with a cost of 3 or more and add it to your hand.",
      },
    });
    const fill = fillers(49);
    expect(rows([entry(weird), ...fill.entries], [weird, ...fill.cards])).toEqual([]);
  });
});
