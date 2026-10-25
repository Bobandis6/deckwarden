import { describe, expect, it } from "vitest";

import { mtgAdapter } from "./adapter";
import { card } from "./test-fixtures";
import { mtgTokenCaption, mtgTokenLinks, mtgTokenQuery } from "./tokens";

const token = (over: Parameters<typeof card>[0]) =>
  card({
    primaryType: "Creature",
    costValue: 0,
    ...over,
    attrs: { type_line: "", oracle_text: "", ...over.attrs, is_token: true },
  });

describe("mtgTokenCaption (DECK-TOKENS)", () => {
  it("P/T and color tell the fifteen Soldiers apart", () => {
    const white = token({
      name: "Soldier",
      colorsMask: 1,
      attrs: { type_line: "Token Creature — Soldier", oracle_text: "", power: "1", toughness: "1" },
    });
    const red = token({ ...white, colorsMask: 8 });
    expect(mtgTokenCaption(white)).toBe("1/1 white");
    expect(mtgTokenCaption(red)).toBe("1/1 red");
  });

  it("adds the first two keywords, lowercased, after a comma (one middle dot a line)", () => {
    const spirit = token({
      name: "Spirit",
      colorsMask: 1,
      attrs: {
        type_line: "Token Creature — Spirit",
        oracle_text: "Flying",
        power: "1",
        toughness: "1",
        keywords: ["Flying"],
      },
    });
    const dragon = token({
      name: "Dragon",
      colorsMask: 8 | 16,
      attrs: {
        type_line: "Token Creature — Dragon",
        oracle_text: "",
        power: "4",
        toughness: "4",
        keywords: ["Flying", "Haste", "Trample"],
      },
    });
    expect(mtgTokenCaption(spirit)).toBe("1/1 white, flying");
    expect(mtgTokenCaption(dragon)).toBe("4/4 red green, flying, haste");
    expect(mtgTokenCaption(dragon)).not.toContain("·");
  });

  it("a colorless creature token says so; a bare token (Treasure, The Monarch) needs nothing", () => {
    const construct = token({
      name: "Construct",
      attrs: {
        type_line: "Token Artifact Creature — Construct",
        oracle_text: "",
        power: "0",
        toughness: "0",
      },
    });
    const treasure = token({
      name: "Treasure",
      primaryType: "Artifact",
      attrs: { type_line: "Token Artifact — Treasure", oracle_text: "" },
    });
    expect(mtgTokenCaption(construct)).toBe("0/0 colorless");
    expect(mtgTokenCaption(treasure)).toBeNull();
  });

  it("a card is never captioned, whatever its stats", () => {
    expect(
      mtgTokenCaption(
        card({
          name: "Grizzly Bears",
          attrs: { type_line: "Creature — Bear", oracle_text: "", power: "2", toughness: "2" },
        }),
      ),
    ).toBeNull();
  });

  it("the adapter declares it, and the links read attrs.tokens", () => {
    expect(mtgAdapter.display.tokenCaption).toBe(mtgTokenCaption);
    expect(mtgAdapter.tokenLinks).toBe(mtgTokenLinks);
    const tithe = card({
      name: "Smothering Tithe",
      attrs: { type_line: "Enchantment", oracle_text: "", tokens: ["k1"] },
    });
    expect(mtgTokenLinks(tithe)).toEqual(["k1"]);
    expect(mtgTokenLinks(card({ name: "Sol Ring" }))).toEqual([]);
  });
});

describe("mtgTokenQuery (DECK-TOKENS): what a player reads off a token finds it", () => {
  it("the owner's case: the 4/4 blue-red Elemental, thirtieth of 39 by name alone", () => {
    expect(mtgTokenQuery("Elemental 4/4 blue red")).toEqual({
      name: "elemental",
      power: "4",
      toughness: "4",
      colors: "including:UR",
    });
    // Any order, "and" between colors, a spaced slash.
    expect(mtgTokenQuery("blue and red 4 / 4 elemental")).toEqual({
      name: "elemental",
      power: "4",
      toughness: "4",
      colors: "including:UR",
    });
  });

  it("a star side filters nothing (it stores as no number); stats alone need no name", () => {
    expect(mtgTokenQuery("*/* green")).toEqual({ colors: "including:G" });
    expect(mtgTokenQuery("1/* soldier")).toEqual({ name: "soldier", power: "1" });
  });

  it("keywords, two-word ones first", () => {
    expect(mtgTokenQuery("Spirit flying")).toEqual({ name: "spirit", keywords: "Flying" });
    expect(mtgTokenQuery("first strike haste knight")).toEqual({
      name: "knight",
      keywords: "First strike,Haste",
    });
  });

  it("colorless is exactly none; a plain name passes through, 'and' included", () => {
    expect(mtgTokenQuery("colorless 1/1 construct")).toEqual({
      name: "construct",
      power: "1",
      toughness: "1",
      colors: "exactly:",
    });
    expect(mtgTokenQuery("The Monarch")).toEqual({ name: "the monarch" });
    expect(mtgTokenQuery("Day and Night")).toEqual({ name: "day and night" });
  });

  it("the adapter declares it, with the box's words", () => {
    expect(mtgAdapter.tokenQuery).toBe(mtgTokenQuery);
    expect(mtgAdapter.display.tokenSearch?.placeholder).toContain("4/4 blue red");
    expect(mtgAdapter.display.tokenSearch?.narrowHint).not.toContain("·");
  });
});
