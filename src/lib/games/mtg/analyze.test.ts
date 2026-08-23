import { describe, expect, it } from "vitest";

import { analyzeMtg } from "./analyze";
import {
  atraxa,
  cardMap,
  commanderDeck,
  entry,
  island,
  lightningBolt,
  solRing,
} from "./test-fixtures";

function block(blocks: ReturnType<typeof analyzeMtg>, id: string) {
  const b = blocks.find((x) => x.id === id);
  if (!b) throw new Error(`missing block ${id}`);
  return b;
}

describe("analyzeMtg", () => {
  const deck = commanderDeck([atraxa], [entry(solRing), entry(lightningBolt), entry(island, 30)]);
  const cards = cardMap([atraxa, solRing, lightningBolt, island]);
  const blocks = analyzeMtg(deck, cards);

  it("emits data blocks only (never components)", () => {
    for (const b of blocks) expect(["histogram", "breakdown", "stat", "table"]).toContain(b.kind);
  });

  it("builds a qty-weighted mana curve excluding lands", () => {
    const curve = block(blocks, "mana-curve");
    if (curve.kind !== "histogram") throw new Error("wrong kind");
    // MV 1: Sol Ring + Bolt; MV 4: Atraxa; 30 Islands excluded.
    expect(curve.buckets.map((b) => b.value)).toEqual([0, 2, 0, 0, 1, 0, 0, 0]);
    expect(curve.buckets[7].label).toBe("7+");
  });

  it("computes average mana value over nonland cards", () => {
    const stat = block(blocks, "avg-mv");
    if (stat.kind !== "stat") throw new Error("wrong kind");
    expect(stat.value).toBe("2.00"); // (1 + 1 + 4) / 3
  });

  it("counts lands and breaks down types by quantity", () => {
    const lands = block(blocks, "lands");
    if (lands.kind !== "stat") throw new Error("wrong kind");
    expect(lands.value).toBe("30");

    const types = block(blocks, "types");
    if (types.kind !== "breakdown") throw new Error("wrong kind");
    expect(types.slices[0]).toEqual({ label: "Land", value: 30 });
  });

  it("sums cheapest-printing prices", () => {
    const price = block(blocks, "price");
    if (price.kind !== "stat") throw new Error("wrong kind");
    expect(price.value).toBe("$19.70"); // Atraxa 18.50 + Sol Ring 1.20
  });
});
