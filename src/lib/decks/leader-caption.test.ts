/**
 * Leader captions (R5b): One Piece reads id + stat line, Magic its P/T (no
 * id badge), a stat-less card has no caption; the raised card's facts (U3b)
 * join the type line and the caption. (The share header's `leaderLine` and
 * its partner join left with U6.)
 */
import { describe, expect, it } from "vitest";

import type { CardData } from "@/lib/games/types";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import { leaderCaption, leaderFacts } from "./leader-caption";

const mtg = getAdapter("mtg");
const optcg = getAdapter("optcg");

const enel: CardData = {
  id: "ef4c399f-fee2-4408-8e1c-dfefb0ac03be",
  name: "Enel",
  externalKey: "OP15-058",
  primaryType: "Leader",
  costValue: null,
  colorsMask: 32,
  ciMask: 32,
  isLeaderCandidate: true,
  isPreview: false,
  cheapestUsd: null,
  popularity: null,
  legality: [],
  attrs: { category: "leader", power_num: 5000, life: 5 },
};

const queza = card({
  name: "Queza, Augur of Agonies",
  attrs: {
    type_line: "Legendary Creature — Cephalid Advisor",
    oracle_text: "",
    power: "2",
    toughness: "5",
  },
});
const planeswalker = card({
  name: "Tevesh Szat, Doom of Fools",
  attrs: { type_line: "Legendary Planeswalker — Szat", oracle_text: "", loyalty: "4" },
});
const stateless = card({
  name: "Nameless",
  attrs: { type_line: "Legendary Artifact", oracle_text: "" },
});

describe("leaderCaption", () => {
  it("One Piece: printed id and the stat line; Magic: P/T or Loyalty, no id", () => {
    expect(leaderCaption(optcg, enel)).toBe("OP15-058 · 5000 Power · 5 Life");
    expect(leaderCaption(mtg, queza)).toBe("2/5");
    expect(leaderCaption(mtg, planeswalker)).toBe("Loyalty 4");
    expect(leaderCaption(mtg, stateless)).toBe("");
    expect(leaderCaption(undefined, enel)).toBe("");
  });
});

describe("leaderFacts (U3b)", () => {
  it("the type line and the caption as the adapter gives them, data not copy; nothing without an adapter", () => {
    expect(leaderFacts(mtg, queza)).toBe("Legendary Creature — Cephalid Advisor · 2/5");
    expect(leaderFacts(mtg, planeswalker)).toBe("Legendary Planeswalker — Szat · Loyalty 4");
    // No stat line: the type line alone, never a dangling separator.
    expect(leaderFacts(mtg, stateless)).toBe("Legendary Artifact");
    expect(leaderFacts(optcg, enel)).toBe("Leader · OP15-058 · 5000 Power · 5 Life");
    expect(leaderFacts(undefined, enel)).toBe("");
  });
});
