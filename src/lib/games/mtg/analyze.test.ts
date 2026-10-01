import { describe, expect, it } from "vitest";

import { mtgAdapter } from "./adapter";
import { analyzeMtg } from "./analyze";
import { MTG_CURVE_TEMPLATE } from "./recommend";
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

  it("the mana curve carries the editorial curve template as its target (R6, G9)", () => {
    const curve = block(blocks, "mana-curve");
    if (curve.kind !== "histogram") throw new Error("wrong kind");
    expect(curve.target).toEqual({ label: "Curve template", values: MTG_CURVE_TEMPLATE });
    expect(curve.target!.values).toHaveLength(curve.buckets.length);
    // The same skeleton the Cut Coach reads — one template, two views.
    expect(curve.target!.values).toBe(mtgAdapter.recommend!.curve!.buckets);
    // No other block carries a target.
    for (const b of blocks) if (b.id !== "mana-curve") expect("target" in b).toBe(false);
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

  it("counts an any-color producer once for each color the commander allows", () => {
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
    // Birds is an "Other" source of Atraxa's WUBG — no Red row; the 2 Islands are Blue lands.
    expect(sources.rows).toEqual([
      ["White", 0, 1],
      ["Blue", 2, 1],
      ["Black", 0, 1],
      ["Green", 0, 1],
    ]);
    expect(sources.hint).toBe(
      "Cards that make \u201cany color\u201d count once for each color your commander allows; Treasure makers count through their reminder text.",
    );
  });

  it("lists only White and Colorless for a mono-white deck with Arcane Signet and a Treasure maker", () => {
    const sram = card({
      name: "Sram, Senior Edificer",
      primaryType: "Creature",
      costValue: 2,
      colorsMask: 1,
      ciMask: 1,
      attrs: {
        type_line: "Legendary Creature — Dwarf Advisor",
        oracle_text: "Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.",
        mana_cost: "{1}{W}",
      },
    });
    const signet = card({
      name: "Arcane Signet",
      primaryType: "Artifact",
      costValue: 2,
      attrs: {
        type_line: "Artifact",
        oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
        mana_cost: "{2}",
      },
    });
    const treasureMaker = card({
      name: "Smothering Tithe",
      primaryType: "Enchantment",
      costValue: 4,
      colorsMask: 1,
      ciMask: 1,
      attrs: {
        type_line: "Enchantment",
        oracle_text:
          "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this artifact: Add one mana of any color.\")",
        mana_cost: "{3}{W}",
      },
    });
    const plains = card({
      name: "Plains",
      primaryType: "Land",
      costValue: 0,
      attrs: { type_line: "Basic Land — Plains", oracle_text: "({T}: Add {W}.)", mana_cost: "" },
    });
    const d = commanderDeck(
      [sram],
      [entry(signet), entry(treasureMaker), entry(solRing), entry(plains, 30)],
    );
    const sources = block(
      analyzeMtg(d, cardMap([sram, signet, treasureMaker, solRing, plains])),
      "mana-sources",
    );
    if (sources.kind !== "table") throw new Error("wrong kind");
    expect(sources.rows).toEqual([
      ["White", 30, 2],
      ["Colorless", 0, 1],
    ]);
  });

  it("keeps every produced color while the deck has no commander", () => {
    const signet = card({
      name: "Arcane Signet",
      primaryType: "Artifact",
      costValue: 2,
      attrs: {
        type_line: "Artifact",
        oracle_text: "{T}: Add one mana of any color in your commander's color identity.",
        mana_cost: "{2}",
      },
    });
    const d = commanderDeck([], [entry(signet), entry(island, 3)]);
    const sources = block(analyzeMtg(d, cardMap([signet, island])), "mana-sources");
    if (sources.kind !== "table") throw new Error("wrong kind");
    expect(sources.rows).toEqual([
      ["White", 0, 1],
      ["Blue", 3, 1],
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
