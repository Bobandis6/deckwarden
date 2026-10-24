import { describe, expect, it } from "vitest";

import { mtgAdapter } from "./adapter";
import { card } from "./test-fixtures";
import { mtgTokenCaption, mtgTokenLinks } from "./tokens";

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
