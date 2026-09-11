/**
 * Leader captions (R5b): One Piece reads id + stat line, Magic its P/T (no
 * id badge), a stat-less card has no caption, and partners join with " & "
 * in the given order.
 */
import { describe, expect, it } from "vitest";

import type { CardData } from "@/lib/games/types";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import { leaderCaption, leaderLine } from "./leader-caption";

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
const tymna = card({
  name: "Tymna the Weaver",
  attrs: {
    type_line: "Legendary Creature — Human Cleric",
    oracle_text: "",
    power: "2",
    toughness: "2",
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

describe("leaderLine", () => {
  it("names each leader with its caption; partners join with ' & ' in order", () => {
    expect(leaderLine(optcg, [enel])).toBe("Enel · OP15-058 · 5000 Power · 5 Life");
    expect(leaderLine(mtg, [queza])).toBe("Queza, Augur of Agonies · 2/5");
    expect(leaderLine(mtg, [tymna, queza])).toBe(
      "Tymna the Weaver · 2/2 & Queza, Augur of Agonies · 2/5",
    );
    expect(leaderLine(mtg, [stateless])).toBe("Nameless");
    expect(leaderLine(mtg, [])).toBe("");
  });
});
