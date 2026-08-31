import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import { buildLibrary, drawHand, HAND_SIZE, shuffle } from "./sample-hand";

const entry = (cardId: string, qty = 1, zone = "main") => ({ cardId, zone, qty, tags: [] });

/** Deterministic rng cycling through given values (0 ≤ v < 1). */
const cyclingRng = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("buildLibrary", () => {
  it("expands entries by qty and excludes the commander zone", () => {
    const lib = buildLibrary(
      [entry("atraxa", 1, "commander"), entry("island", 3), entry("sol-ring", 1)],
      COMMANDER,
    );
    expect(lib).toHaveLength(4);
    expect(lib.filter((id) => id === "island")).toHaveLength(3);
    expect(lib).not.toContain("atraxa");
  });

  it("is empty for a deck that is only a commander", () => {
    expect(buildLibrary([entry("atraxa", 1, "commander")], COMMANDER)).toEqual([]);
  });
});

describe("shuffle", () => {
  it("preserves the multiset and leaves the input untouched", () => {
    const input = ["a", "b", "b", "c", "d"];
    const frozen = [...input];
    const out = shuffle(input, cyclingRng([0.9, 0.1, 0.5, 0.3]));
    expect(input).toEqual(frozen);
    expect([...out].sort()).toEqual([...frozen].sort());
  });

  it("applies the Fisher–Yates swaps the rng dictates", () => {
    // rng always 0 → every position swaps with index 0: [a,b,c] → c,a,b… walk
    // it: i=2 j=0 → [c,b,a]; i=1 j=0 → [b,c,a].
    expect(shuffle(["a", "b", "c"], () => 0)).toEqual(["b", "c", "a"]);
    // rng just under 1 → j === i every time: identity permutation.
    expect(shuffle(["a", "b", "c"], () => 0.999)).toEqual(["a", "b", "c"]);
  });
});

describe("drawHand", () => {
  it("draws exactly 7 cards from a full library", () => {
    const lib = Array.from({ length: 99 }, (_, i) => `card-${i}`);
    const hand = drawHand(lib);
    expect(hand).toHaveLength(HAND_SIZE);
    for (const id of hand) expect(lib).toContain(id);
  });

  it("draws the whole library when it holds fewer than 7", () => {
    expect(drawHand(["a", "b", "c"]).sort()).toEqual(["a", "b", "c"]);
    expect(drawHand([])).toEqual([]);
  });
});
