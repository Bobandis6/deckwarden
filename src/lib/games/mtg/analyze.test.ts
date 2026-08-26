import { describe, expect, it } from "vitest";

import { analyzeMtg } from "./analyze";
import {
  atraxa,
  card,
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

  it("tallies mana sources by color, lands split from other producers", () => {
    const sources = block(blocks, "mana-sources");
    if (sources.kind !== "table") throw new Error("wrong kind");
    expect(sources.columns).toEqual(["Color", "Lands", "Other"]);
    // 30 Islands add {U}; Sol Ring adds {C}{C}; Atraxa and Bolt produce nothing.
    expect(sources.rows).toEqual([
      ["Blue", 30, 0],
      ["Colorless", 0, 1],
    ]);
  });

  it("counts any-color producers as a source of all five colors", () => {
    const birds = card({
      name: "Birds of Paradise",
      costValue: 1,
      colorsMask: 16,
      ciMask: 16,
      attrs: {
        type_line: "Creature — Bird",
        oracle_text: "Flying\n{T}: Add one mana of any color.",
        mana_cost: "{G}",
      },
    });
    const d = commanderDeck([atraxa], [entry(birds), entry(island, 2)]);
    const sources = block(analyzeMtg(d, cardMap([atraxa, birds, island])), "mana-sources");
    if (sources.kind !== "table") throw new Error("wrong kind");
    // Birds is an "Other" source of WUBRG; the 2 Islands are Blue lands.
    expect(sources.rows).toEqual([
      ["White", 0, 1],
      ["Blue", 2, 1],
      ["Black", 0, 1],
      ["Red", 0, 1],
      ["Green", 0, 1],
    ]);
  });

  it("sums cheapest-printing prices", () => {
    const price = block(blocks, "price");
    if (price.kind !== "stat") throw new Error("wrong kind");
    expect(price.value).toBe("$19.70"); // Atraxa 18.50 + Sol Ring 1.20
  });
});
