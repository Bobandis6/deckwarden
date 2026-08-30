import { describe, expect, it } from "vitest";

import { ogCurveBuckets } from "./curve";

describe("ogCurveBuckets", () => {
  it("matches analyzeMtg conventions: lands out, null cost at 0, 7+ capped, qty-weighted", () => {
    const buckets = ogCurveBuckets([
      { primaryType: "Land", costValue: 0, qty: 35 },
      { primaryType: "Creature", costValue: null, qty: 1 },
      { primaryType: "Instant", costValue: 1, qty: 2 },
      { primaryType: "Sorcery", costValue: 12, qty: 1 },
      { primaryType: "Creature", costValue: 7, qty: 1 },
    ]);
    expect(buckets).toEqual([1, 2, 0, 0, 0, 0, 0, 2]);
  });

  it("returns all-zero buckets for an empty or all-land deck", () => {
    expect(ogCurveBuckets([])).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(ogCurveBuckets([{ primaryType: "Land", costValue: null, qty: 40 }])).toEqual(
      new Array(8).fill(0),
    );
  });
});
