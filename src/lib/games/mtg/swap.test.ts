/**
 * Y7a — Magic's Swap Lab words (WAVE4 D8 + D0): the role line names its
 * source and never claims two cards do exactly the same thing; the chips
 * are mana value and the Game Changer status; lands aren't offered.
 */
import { describe, expect, it } from "vitest";

import type { CardData } from "../types";
import { MTG_ROLES } from "./roles";
import { mtgSwap } from "./swap";

const card = (attrs: Record<string, unknown>, costValue: number | null = 2): CardData => ({
  id: "x",
  name: "X",
  externalKey: "x",
  primaryType: "Artifact",
  costValue,
  colorsMask: 0,
  ciMask: 0,
  isLeaderCandidate: false,
  isPreview: false,
  cheapestUsd: null,
  popularity: null,
  attrs: { type_line: "Artifact", oracle_text: "", ...attrs },
  legality: [],
});

describe("mtgSwap", () => {
  it("credits Scryfall Tagger in plain words, without notation or claims of sameness", () => {
    const { why } = mtgSwap.evidence(["ramp", "mana rock"]);
    expect(why).toBe("Both: ramp · mana rock — community-tagged on Scryfall Tagger");
    for (const r of MTG_ROLES) {
      const line = mtgSwap.evidence([r.label]).why;
      expect(line).not.toMatch(/\b(same|identical|equivalent|replaces|approve)/i);
    }
  });

  it("declares every role with its Tagger page, the source and the ±1 window", () => {
    expect(mtgSwap.roles.map((r) => r.key)).toEqual(MTG_ROLES.map((r) => r.key));
    expect(mtgSwap.roles[1]).toEqual({
      key: "mana-rock",
      label: "mana rock",
      href: "https://tagger.scryfall.com/tags/card/mana-rock",
    });
    expect(mtgSwap.rolesPath).toBe("roles");
    expect(mtgSwap.source).toBe("scryfall_tagger");
    expect(mtgSwap.costWindow).toBe(1);
  });

  it("offers every card but a land; candidates are nonland too", () => {
    expect(mtgSwap.offers({ primaryType: "Artifact", costValue: 1 })).toBe(true);
    expect(mtgSwap.offers({ primaryType: null, costValue: null })).toBe(true);
    expect(mtgSwap.offers({ primaryType: "Land", costValue: 0 })).toBe(false);
    expect(mtgSwap.candidateScope).toEqual({ column: "primary_type", op: "ne", value: "Land" });
  });

  it("chips: the mana value, then the Game Changer status beside the outgoing card", () => {
    expect(mtgSwap.chips(card({}), card({}))).toEqual(["Mana value 2"]);
    expect(mtgSwap.chips(card({}), card({ game_changer: true }, 1))).toEqual([
      "Mana value 1",
      "Game Changer (Wizards' list)",
    ]);
    expect(mtgSwap.chips(card({ game_changer: true }), card({}, 0))).toEqual([
      "Mana value 0",
      "Not a Game Changer",
    ]);
    expect(mtgSwap.chips(card({}), card({}, null))).toEqual([]);
  });
});
