import { describe, expect, it } from "vitest";

import { staplesCurveBlock } from "./curve";

describe("staplesCurveBlock", () => {
  it("buckets by mana value, lands and null costs excluded, 7+ folded", () => {
    const block = staplesCurveBlock([
      { primaryType: "Artifact", costValue: 1 },
      { primaryType: "Creature", costValue: 1 },
      { primaryType: "Land", costValue: 0 },
      { primaryType: "Sorcery", costValue: null },
      { primaryType: "Creature", costValue: 12 },
    ]);
    expect(block).not.toBeNull();
    expect(block!.kind).toBe("histogram");
    if (block!.kind !== "histogram") return;
    expect(block!.buckets[1]).toEqual({ label: "1", value: 2 });
    expect(block!.buckets[7]).toEqual({ label: "7+", value: 1 });
    expect(block!.buckets.reduce((a, b) => a + b.value, 0)).toBe(3);
  });

  it("null when nothing survives the filters (honest empty state upstream)", () => {
    expect(staplesCurveBlock([{ primaryType: "Land", costValue: 0 }])).toBeNull();
    expect(staplesCurveBlock([])).toBeNull();
  });
});
