/**
 * Y7b — "Swap in…"'s cut partner (WAVE4 D8): the Cut Coach's cheapest
 * cut that isn't a complete-combo piece, inside the incoming card's curve
 * bucket — over Magic's real declarations (the bucket rule, the cut
 * phrasing), with fixture cards.
 */
import { describe, expect, it } from "vitest";

import { mtgRecommend } from "@/lib/games/mtg/recommend";
import type { CompleteCombo } from "@/lib/games/types";
import { completeCombosByCard, type CutEntryInput } from "./cuts";
import { cutCombosFromFacts, planSwapIn, type SwapInInput } from "./swap-in";

function entry(
  name: string,
  costValue: number | null,
  popularity: number | null,
  { zone = "main", qty = 1, primaryType = "Creature", tags = [] as string[] } = {},
): CutEntryInput {
  return {
    card: { id: `id-${name}`, name, primaryType, costValue, cheapestUsd: null, popularity },
    zone,
    qty,
    tags,
  };
}

const commander = entry("Odric", 4, 900, { zone: "commander" });
// Three 3-drops: a fringe card (the cheapest cut), a staple (a keep line),
// and a fringe card that completes a combo (never the partner).
const fringe3 = entry("Fringe Three", 3, 30_000);
const staple3 = entry("Staple Three", 3, 40);
const combo3 = entry("Combo Three", 3, 45_000);
const comboMate = entry("Combo Mate", 5, 500);
// The cheapest cut overall — but a 2-drop.
const fringe2 = entry("Fringe Two", 2, 48_000);
const unranked = entry("Unranked Seven", 8, null);
const forest = entry("Forest", null, null, { primaryType: "Land", qty: 30 });

const ENTRIES = [commander, fringe3, staple3, combo3, comboMate, fringe2, unranked, forest];
const COMBO: CompleteCombo = {
  key: "c1",
  cardPieces: [combo3.card.id, comboMate.card.id].sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite tokens"],
  popularity: 1200,
};

function plan(
  incoming: { id: string; primaryType: string; costValue: number | null },
  facts: CompleteCombo[] | null = [COMBO],
  entries = ENTRIES,
) {
  const names = new Map(entries.map((e) => [e.card.id, e.card]));
  const input: SwapInInput = {
    meta: mtgRecommend,
    roleTargets: [],
    entries,
    excludedZones: new Set(["commander"]),
    completeCombosByCard: completeCombosByCard(
      cutCombosFromFacts(facts, names),
      new Set(entries.map((e) => e.card.id)),
    ),
    incoming,
    zone: "main",
  };
  return planSwapIn(input);
}
const names = (options: { name: string }[]) => options.map((o) => o.name);

describe("planSwapIn", () => {
  it("names the cheapest ordinary cut in the incoming card's bucket — not the cheapest overall, never a combo piece", () => {
    const p = plan({ id: "new", primaryType: "Sorcery", costValue: 3 });
    expect(p.bucket).toBe(3);
    expect(p.bucketLabel).toBe("3");
    expect(p.partner?.name).toBe("Fringe Three");
    // Its tradeoff line is the Coach's, cut side first.
    expect(p.partner?.cut?.evidence[0].side).toBe("cut");
    expect(p.partner?.cut?.evidence[0].why).toBe(
      "Outside the widely-played tier of Commander cards",
    );
    // The bucket's others: the staple, then the combo piece (members last).
    expect(names(p.sameBucket)).toEqual(["Staple Three", "Combo Three"]);
    expect(p.sameBucket[1].cut?.inCompleteCombo).toBe(true);
    // Everything else in the main list, Coach order first, the unranked by name after.
    expect(names(p.others)).toEqual(["Fringe Two", "Combo Mate", "Forest", "Unranked Seven"]);
    expect(p.others.find((o) => o.name === "Unranked Seven")?.cut).toBeNull();
    // The commander is never a partner.
    expect([...names(p.sameBucket), ...names(p.others)]).not.toContain("Odric");
  });

  it("with no combo facts nothing is protected: the fringier combo piece is named", () => {
    const p = plan({ id: "new", primaryType: "Sorcery", costValue: 3 }, null);
    expect(p.partner?.name).toBe("Combo Three");
    expect(p.partner?.cut?.inCompleteCombo).toBe(false);
  });

  it("a bucket whose only ranked cards are combo pieces names nobody", () => {
    const entries = ENTRIES.filter((e) => e !== fringe3 && e !== staple3);
    const p = plan({ id: "new", primaryType: "Sorcery", costValue: 3 }, [COMBO], entries);
    expect(p.partner).toBeNull();
    expect(names(p.sameBucket)).toEqual(["Combo Three"]);
  });

  it("a land or a costless card has no bucket: no partner, every card choosable", () => {
    for (const incoming of [
      { id: "new-land", primaryType: "Land", costValue: null },
      { id: "new-x", primaryType: "Sorcery", costValue: null },
    ]) {
      const p = plan(incoming);
      expect(p).toMatchObject({ bucket: null, bucketLabel: null, partner: null, sameBucket: [] });
      expect(names(p.others)).toEqual([
        "Fringe Two",
        "Fringe Three",
        "Staple Three",
        "Combo Three",
        "Combo Mate",
        "Forest",
        "Unranked Seven",
      ]);
    }
  });

  it("an empty bucket names nobody; past the last bucket counts as the last (7+)", () => {
    const empty = plan({ id: "new", primaryType: "Sorcery", costValue: 6 });
    expect(empty).toMatchObject({ bucket: 6, bucketLabel: "6", partner: null, sameBucket: [] });
    expect(empty.others).toHaveLength(7);

    // Unranked Seven (mana value 8) shares the 7+ bucket with a 10-drop — but has no signal data.
    const big = plan({ id: "new", primaryType: "Creature", costValue: 10 });
    expect(big).toMatchObject({ bucket: 7, bucketLabel: "7+", partner: null });
    expect(names(big.sameBucket)).toEqual(["Unranked Seven"]);
    const ranked7 = entry("Ranked Nine", 9, 41_000);
    const withRanked = plan(
      { id: "new", primaryType: "Creature", costValue: 10 },
      [COMBO],
      [...ENTRIES, ranked7],
    );
    expect(withRanked.partner?.name).toBe("Ranked Nine");
    expect(names(withRanked.sameBucket)).toEqual(["Unranked Seven"]);
  });

  it("a curve whose bucketOf doesn't clamp: past the last bucket still counts as the last", () => {
    // Game-ignorant: three buckets, and a bucketOf that returns the raw cost.
    const meta = {
      ...mtgRecommend,
      curve: {
        ...mtgRecommend.curve!,
        buckets: [1, 1, 1],
        bucketOf: (c: { costValue: number | null }) => c.costValue,
      },
    };
    const four = entry("Four Drop", 4, 47_000);
    const entries = [commander, four, forest];
    const p = planSwapIn({
      meta,
      roleTargets: [],
      entries,
      excludedZones: new Set(["commander"]),
      completeCombosByCard: new Map(),
      incoming: { id: "new", primaryType: "Creature", costValue: 9 },
      zone: "main",
    });
    expect(p).toMatchObject({ bucket: 2, bucketLabel: "2+" });
    expect(p.partner?.name).toBe("Four Drop");
  });

  it("a card already in the list is never its own partner (another Forest)", () => {
    const p = plan({ id: forest.card.id, primaryType: "Land", costValue: null });
    expect(names(p.others)).not.toContain("Forest");
    const q = plan({ id: fringe3.card.id, primaryType: "Sorcery", costValue: 3 });
    expect(q.partner?.name).toBe("Staple Three");
    expect(names(q.sameBucket)).toEqual(["Combo Three"]);
  });

  it("only the swap's zone holds partners", () => {
    const p = plan({ id: "new", primaryType: "Creature", costValue: 4 });
    expect(p.partner).toBeNull();
    expect([...names(p.sameBucket), ...names(p.others)]).not.toContain("Odric");
  });

  it("cutCombosFromFacts names each piece from the card map; no facts, no combos", () => {
    const named = new Map([
      [combo3.card.id, { name: "Combo Three" }],
      [comboMate.card.id, { name: "Combo Mate" }],
    ]);
    expect(cutCombosFromFacts([COMBO], named)).toEqual([
      {
        templates: [],
        missingPieces: [],
        inDeckPieces: COMBO.cardPieces.map((id) => ({ id, name: named.get(id)!.name })),
        results: ["Infinite tokens"],
        popularity: 1200,
      },
    ]);
    expect(cutCombosFromFacts(null, named)).toEqual([]);
  });
});
