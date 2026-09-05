import { describe, expect, it } from "vitest";

import { cardSlug, leaderHubSlug, normalizeCardName } from "./normalize";

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

describe("leaderHubSlug", () => {
  it("appends the lowercased external key (OP punctuation shapes verified live in P4.4)", () => {
    expect(leaderHubSlug("Monkey.D.Luffy", "OP01-003")).toBe("monkey-d-luffy-op01-003");
    expect(leaderHubSlug('Eustass"Captain"Kid', "OP05-074")).toBe("eustass-captain-kid-op05-074");
    expect(leaderHubSlug("Kin'emon", "OP06-025")).toBe("kinemon-op06-025");
    expect(leaderHubSlug("Monkey.D.Luffy", "ST01-001")).toBe("monkey-d-luffy-st01-001");
  });

  it("stays within 60 chars, trimming the name part, never the key", () => {
    const slug = leaderHubSlug("A".repeat(80), "PRB01-001");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-prb01-001")).toBe(true);
    expect(slug.includes("--")).toBe(false);
  });

  it("empties when either part yields nothing", () => {
    expect(leaderHubSlug("____", "OP01-001")).toBe("");
    expect(leaderHubSlug("Monkey.D.Luffy", "___")).toBe("");
  });
});
