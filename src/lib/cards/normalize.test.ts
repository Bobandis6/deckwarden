import { describe, expect, it } from "vitest";

import { cardSlug, normalizeCardName } from "./normalize";

describe("normalizeCardName", () => {
  it("deaccents, lowercases, folds faces", () => {
    expect(normalizeCardName("Lim-Dûl the Necromancer")).toBe("lim-dul the necromancer");
    expect(normalizeCardName("Fire // Ice")).toBe("fire ice");
    expect(normalizeCardName("Æther Vial")).toBe("aether vial");
  });
});

describe("cardSlug", () => {
  it("hyphenates and drops punctuation", () => {
    expect(cardSlug("Atraxa, Praetors' Voice")).toBe("atraxa-praetors-voice");
    expect(cardSlug("Ragavan, Nimble Pilferer")).toBe("ragavan-nimble-pilferer");
    expect(cardSlug("Lim-Dûl the Necromancer")).toBe("lim-dul-the-necromancer");
  });

  it("slugs the front face only", () => {
    expect(cardSlug("Esika, God of the Tree // The Prismatic Bridge")).toBe(
      "esika-god-of-the-tree",
    );
  });

  it("apostrophes vanish instead of hyphenating", () => {
    expect(cardSlug("Yawgmoth's Will")).toBe("yawgmoths-will");
    expect(cardSlug("K'rrik, Son of Yawgmoth")).toBe("krrik-son-of-yawgmoth");
  });

  it("caps length without a trailing hyphen and empties gracefully", () => {
    const long = cardSlug("A".repeat(20) + " " + "B".repeat(59));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
    expect(cardSlug("____")).toBe("");
  });
});
