/**
 * The W7 name rule against live-verified TCGplayer behavior (2026-09-20, real
 * Mass Entry submissions): full names for split-frame cards ("Wear // Tear" ✓,
 * "Fire // Ice" ✓), front-face names for adventures ("Bonecrusher Giant" ✓
 * but "Bonecrusher Giant // Stomp" REJECTED — this overruled the contract's
 * mana_cost-only sketch) and for transform/MDFC ("Delver of Secrets" ✓).
 */
import { describe, expect, it } from "vitest";

import { card } from "./test-fixtures";
import { cardUrl, massEntryLine, skipByDefault, tcgplayerName } from "./buy";

const wearTear = card({
  name: "Wear // Tear",
  attrs: { type_line: "Instant // Instant", oracle_text: "", mana_cost: "{1}{R} // {W}" },
});

const bonecrusher = card({
  name: "Bonecrusher Giant // Stomp",
  attrs: {
    type_line: "Creature — Giant // Instant — Adventure",
    oracle_text: "",
    mana_cost: "{2}{R} // {1}{R}",
  },
});

const delver = card({
  name: "Delver of Secrets // Insectile Aberration",
  // Transform: Scryfall has no top-level mana_cost; ingest stores the front
  // face's (never " // "-joined).
  attrs: { type_line: "Creature — Human Wizard", oracle_text: "", mana_cost: "{U}" },
});

const valakut = card({
  name: "Valakut Awakening // Valakut Stoneforge",
  // MDFC with a costless back face path: mana_cost may be absent entirely.
  attrs: { type_line: "Instant // Land", oracle_text: "" },
});

const mountain = card({
  name: "Mountain",
  primaryType: "Land",
  attrs: { type_line: "Basic Land — Mountain", oracle_text: "({T}: Add {R}.)" },
});

describe("tcgplayerName", () => {
  it("keeps plain names", () => {
    expect(
      tcgplayerName(card({ name: "Sol Ring", attrs: { type_line: "Artifact", oracle_text: "" } })),
    ).toBe("Sol Ring");
  });

  it("keeps the full name for split-frame cards (combined mana_cost, no attached half)", () => {
    expect(tcgplayerName(wearTear)).toBe("Wear // Tear");
    // Aftermath and Room cards share the split frame and the full product name.
    expect(
      tcgplayerName(
        card({
          name: "Dusk // Dawn",
          attrs: {
            type_line: "Sorcery // Sorcery — Aftermath",
            oracle_text: "",
            mana_cost: "{2}{W}{W} // {3}{W}{W}",
          },
        }),
      ),
    ).toBe("Dusk // Dawn");
    expect(
      tcgplayerName(
        card({
          name: "Bottomless Pool // Locker Room",
          attrs: {
            type_line: "Enchantment — Room // Enchantment — Room",
            oracle_text: "",
            mana_cost: "{U} // {3}{U}",
          },
        }),
      ),
    ).toBe("Bottomless Pool // Locker Room");
  });

  it("uses the front-face name for adventures and omens despite the combined cost", () => {
    expect(tcgplayerName(bonecrusher)).toBe("Bonecrusher Giant");
    expect(
      tcgplayerName(
        card({
          name: "Stormscale Scion // Dracogenesis Omen",
          attrs: {
            type_line: "Creature — Dragon // Sorcery — Omen",
            oracle_text: "",
            mana_cost: "{4}{R}{R} // {2}{R}",
          },
        }),
      ),
    ).toBe("Stormscale Scion");
  });

  it("uses the front-face name for transform and MDFC cards", () => {
    expect(tcgplayerName(delver)).toBe("Delver of Secrets");
    expect(tcgplayerName(valakut)).toBe("Valakut Awakening");
  });
});

describe("massEntryLine", () => {
  it("prefixes the quantity", () => {
    expect(massEntryLine(mountain, 33)).toBe("33 Mountain");
    expect(massEntryLine(bonecrusher, 1)).toBe("1 Bonecrusher Giant");
  });
});

describe("cardUrl", () => {
  it("is the magic name-search page, name encoded", () => {
    expect(
      cardUrl(card({ name: "Sol Ring", attrs: { type_line: "Artifact", oracle_text: "" } })),
    ).toBe("https://www.tcgplayer.com/search/magic/product?q=Sol%20Ring");
    // The full split name survives encoding; apostrophes pass through.
    expect(cardUrl(wearTear)).toBe(
      "https://www.tcgplayer.com/search/magic/product?q=Wear%20%2F%2F%20Tear",
    );
    expect(
      cardUrl(
        card({ name: "Urza's Incubator", attrs: { type_line: "Artifact", oracle_text: "" } }),
      ),
    ).toContain("q=Urza's%20Incubator");
  });
});

describe("skipByDefault", () => {
  it("skips exactly the Basic supertype", () => {
    expect(skipByDefault(mountain)).toBe(true);
    expect(
      skipByDefault(card({ name: "Wastes", attrs: { type_line: "Basic Land", oracle_text: "" } })),
    ).toBe(true);
    expect(
      skipByDefault(card({ name: "Command Tower", attrs: { type_line: "Land", oracle_text: "" } })),
    ).toBe(false);
    // Snow-covered basics are basics too — "Basic Snow Land — Mountain".
    expect(
      skipByDefault(
        card({
          name: "Snow-Covered Mountain",
          attrs: { type_line: "Basic Snow Land — Mountain", oracle_text: "" },
        }),
      ),
    ).toBe(true);
  });
});
