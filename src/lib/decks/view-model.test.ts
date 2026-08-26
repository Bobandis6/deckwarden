import { describe, expect, it } from "vitest";

import {
  atraxa,
  card,
  cardMap,
  island,
  legalDeck,
  lightningBolt,
  solRing,
  thrasios,
  tymna,
} from "@/lib/games/mtg/test-fixtures";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { groupDeckEntries, splitLeaderEntries, type SortKey, type ViewEntry } from "./view-model";

/** Editor-shaped entry (zone included) — what both consumers actually pass. */
function entry(
  cardId: string,
  qty = 1,
  tags: string[] = [],
  zone = "main",
): ViewEntry & { zone: string } {
  return { cardId, zone, qty, tags };
}

const noCost = card({
  name: "Costless Oddity",
  primaryType: null,
  costValue: null,
  cheapestUsd: null,
  attrs: { type_line: "Card", oracle_text: "" },
});

const fixtureCards = cardMap([atraxa, solRing, island, lightningBolt, noCost]);
const fixtureEntries = [
  entry(solRing.id, 1, ["ramp", "artifacts"]),
  entry(island.id, 30, ["mana"]),
  entry(lightningBolt.id, 1),
  entry(noCost.id, 1),
];

describe("splitLeaderEntries", () => {
  it("separates leader-zone entries from the rest", () => {
    const entries = [entry(atraxa.id, 1, [], "commander"), ...fixtureEntries];
    const { leader, rest } = splitLeaderEntries(entries, COMMANDER);
    expect(leader.map((e) => e.cardId)).toEqual([atraxa.id]);
    expect(rest).toHaveLength(fixtureEntries.length);
  });
});

describe("groupDeckEntries by primaryType", () => {
  const groups = groupDeckEntries(fixtureEntries, fixtureCards, "primaryType", "name");

  it("groups by card primaryType with quantity counts, biggest group first", () => {
    expect(groups.map((g) => [g.label, g.qty])).toEqual([
      ["Land", 30],
      ["Artifact", 1],
      ["Instant", 1],
      ["Other", 1],
    ]);
  });

  it("buckets null primaryType as Other", () => {
    const other = groups.find((g) => g.key === "type:Other");
    expect(other?.items.map((i) => i.card.name)).toEqual(["Costless Oddity"]);
  });

  it("skips entries whose card is missing from the map", () => {
    const withGhost = [...fixtureEntries, entry("missing-card-id", 4)];
    const total = groupDeckEntries(withGhost, fixtureCards, "primaryType", "name").reduce(
      (sum, g) => sum + g.qty,
      0,
    );
    expect(total).toBe(33);
  });

  it("covers a full 100-card deck without losing cards", () => {
    const { deck, cards } = legalDeck();
    const groups = groupDeckEntries(deck.zones.main, cards, "primaryType", "name");
    expect(groups.reduce((sum, g) => sum + g.qty, 0)).toBe(99); // 100 minus commander
  });
});

describe("groupDeckEntries by costValue", () => {
  it("orders groups by ascending cost with the cost-less group last", () => {
    const groups = groupDeckEntries(fixtureEntries, fixtureCards, "costValue", "name");
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ["cost:0", "Cost 0"],
      ["cost:1", "Cost 1"],
      ["cost:none", "No cost"],
    ]);
    expect(groups[1].items.map((i) => i.card.name)).toEqual(["Lightning Bolt", "Sol Ring"]);
  });
});

describe("groupDeckEntries by tags", () => {
  const groups = groupDeckEntries(fixtureEntries, fixtureCards, "tags", "name");

  it("orders tag groups alphabetically with Untagged last", () => {
    expect(groups.map((g) => g.label)).toEqual(["artifacts", "mana", "ramp", "Untagged"]);
  });

  it("puts a multi-tag entry in each of its tag groups", () => {
    const inGroups = groups.filter((g) => g.items.some((i) => i.card.name === "Sol Ring"));
    expect(inGroups.map((g) => g.key)).toEqual(["tag:artifacts", "tag:ramp"]);
  });

  it("collects tagless entries into the Untagged bucket", () => {
    const untagged = groups.find((g) => g.key === "untagged");
    expect(untagged?.items.map((i) => i.card.name)).toEqual(["Costless Oddity", "Lightning Bolt"]);
  });
});

describe("in-group sorting", () => {
  const priced = card({ name: "Aardvark Bauble", cheapestUsd: 0.5, costValue: 6 });
  const sortCards = cardMap([solRing, lightningBolt, noCost, priced, thrasios, tymna]);
  const sortEntries = [
    entry(priced.id),
    entry(noCost.id),
    entry(solRing.id),
    entry(lightningBolt.id),
    entry(thrasios.id),
    entry(tymna.id),
  ];
  const names = (sortBy: SortKey) =>
    groupDeckEntries(sortEntries, sortCards, "tags", sortBy)[0].items.map((i) => i.card.name);

  it("sorts by name", () => {
    expect(names("name")).toEqual([
      "Aardvark Bauble",
      "Costless Oddity",
      "Lightning Bolt",
      "Sol Ring",
      "Thrasios, Triton Hero",
      "Tymna the Weaver",
    ]);
  });

  it("sorts by cost ascending, cost-less last, name tiebreak", () => {
    expect(names("cost")).toEqual([
      "Lightning Bolt", // 1
      "Sol Ring", // 1
      "Thrasios, Triton Hero", // 2
      "Tymna the Weaver", // 3
      "Aardvark Bauble", // 6
      "Costless Oddity", // null
    ]);
  });

  it("sorts by price descending, unpriced last, name tiebreak", () => {
    expect(names("price")).toEqual([
      "Sol Ring", // 1.2
      "Aardvark Bauble", // 0.5
      "Costless Oddity", // null
      "Lightning Bolt",
      "Thrasios, Triton Hero",
      "Tymna the Weaver",
    ]);
  });
});
