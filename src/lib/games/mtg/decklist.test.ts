import { describe, expect, it } from "vitest";

import { parseMtgDecklist, serializeMtgDecklist } from "./decklist";
import { atraxa, cardMap, commanderDeck, entry, island, solRing } from "./test-fixtures";

describe("parseMtgDecklist", () => {
  it("parses MTGO-style lines", () => {
    const { lines, warnings } = parseMtgDecklist("1 Sol Ring\n30 Island\n1x Lightning Bolt\n");
    expect(warnings).toEqual([]);
    expect(lines).toEqual([
      { rawName: "Sol Ring", qty: 1 },
      { rawName: "Island", qty: 30 },
      { rawName: "Lightning Bolt", qty: 1 },
    ]);
  });

  it("parses Arena/Moxfield set + collector-number annotations and foil markers", () => {
    const { lines } = parseMtgDecklist("1 Sol Ring (C21) 263 *F*\n1 Arcane Signet (AFC) 95");
    expect(lines).toEqual([
      { rawName: "Sol Ring", qty: 1, setHint: "c21" },
      { rawName: "Arcane Signet", qty: 1, setHint: "afc" },
    ]);
  });

  it("carries zone hints from section headers and *CMDR* markers", () => {
    const text = ["Commander:", "1 Atraxa, Praetors' Voice", "", "Deck", "1 Sol Ring"].join("\n");
    expect(parseMtgDecklist(text).lines).toEqual([
      { rawName: "Atraxa, Praetors' Voice", qty: 1, zoneHint: "commander" },
      { rawName: "Sol Ring", qty: 1, zoneHint: "main" },
    ]);

    const inline = parseMtgDecklist("1 Kenrith, the Returned King *CMDR*").lines[0];
    expect(inline).toEqual({
      rawName: "Kenrith, the Returned King",
      qty: 1,
      zoneHint: "commander",
    });
  });

  it("keeps names containing an x after the quantity intact", () => {
    expect(parseMtgDecklist("1 Xantcha, Sleeper Agent").lines[0].rawName).toBe(
      "Xantcha, Sleeper Agent",
    );
  });

  it("skips comments and blanks, warns on garbage", () => {
    const { lines, warnings } = parseMtgDecklist("# my deck\n//comment\n\n0 Sol Ring");
    expect(lines).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("preserves double-faced card names with //", () => {
    const { lines } = parseMtgDecklist("1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki");
    expect(lines[0].rawName).toBe("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki");
  });

  it("strips Archidekt category/flag annotations", () => {
    const { lines, warnings } = parseMtgDecklist(
      "1x Sol Ring (c21) 263 [Ramp]\n1x Arcane Signet (afc) 95 *F* [Ramp,Artifact]\n1x Command Tower (afc) 175 ^Have,#7fdb8a^",
    );
    expect(warnings).toEqual([]);
    expect(lines).toEqual([
      { rawName: "Sol Ring", qty: 1, setHint: "c21" },
      { rawName: "Arcane Signet", qty: 1, setHint: "afc" },
      { rawName: "Command Tower", qty: 1, setHint: "afc" },
    ]);
  });

  it("reads Deckstats '# !Commander' markers as commander zone hints", () => {
    const { lines } = parseMtgDecklist("1 Atraxa, Praetors' Voice # !Commander\n1 Sol Ring #ramp");
    expect(lines).toEqual([
      { rawName: "Atraxa, Praetors' Voice", qty: 1, zoneHint: "commander" },
      { rawName: "Sol Ring", qty: 1 },
    ]);
  });
});

/**
 * Real-shaped pastes from the sites the plan row names (Moxfield, Arena, MTGO,
 * Archidekt, TappedOut, Deckstats, MTGGoldfish, EDHREC, Scryfall deck text,
 * plain lists). Each must tokenize with zero warnings and the expected
 * commander split — the paste→resolve→deck round-trip's client half.
 */
describe("parseMtgDecklist against real paste shapes", () => {
  const PASTES: {
    site: string;
    text: string;
    cardLines: number;
    commanders: string[];
  }[] = [
    {
      site: "Moxfield text export",
      text: [
        "1 Atraxa, Praetors' Voice (2X2) 190 *F*",
        "1 Arcane Signet (AFC) 95",
        "1 Beast Within (PIP) 96",
        "10 Forest (SLD) 106",
        "",
        "SIDEBOARD:",
        "1 Swords to Plowshares (STA) 10",
      ].join("\n"),
      cardLines: 5,
      commanders: [],
    },
    {
      site: "Moxfield with CMDR marker",
      text: "1 Kenrith, the Returned King (ELD) 303 *CMDR*\n1 Sol Ring (C21) 263",
      cardLines: 2,
      commanders: ["Kenrith, the Returned King"],
    },
    {
      site: "Arena export",
      text: [
        "Commander",
        "1 Atraxa, Praetors' Voice (OC21) 115",
        "",
        "Deck",
        "1 Sol Ring (SLD) 439",
        "99 Island (ANA) 57",
      ].join("\n"),
      cardLines: 3,
      commanders: ["Atraxa, Praetors' Voice"],
    },
    {
      site: "MTGO .txt",
      text: "1 Sol Ring\n1 Arcane Signet\n35 Island",
      cardLines: 3,
      commanders: [],
    },
    {
      site: "Archidekt export",
      text: [
        "1x Atraxa, Praetors' Voice (2x2) 190 [Commander{top}]",
        "1x Sol Ring (c21) 263 [Ramp]",
        "1x Cultivate (c21) 178 ^Have^ [Ramp]",
      ].join("\n"),
      cardLines: 3,
      commanders: [],
    },
    {
      site: "TappedOut",
      text: "1x Atraxa, Praetors' Voice *CMDR*\n1x Sol Ring\n1x Cultivate",
      cardLines: 3,
      commanders: ["Atraxa, Praetors' Voice"],
    },
    {
      site: "Deckstats export",
      text: [
        "//Main",
        "1 Atraxa, Praetors' Voice # !Commander",
        "1 Sol Ring",
        "1 Cultivate #ramp",
      ].join("\n"),
      cardLines: 3,
      commanders: ["Atraxa, Praetors' Voice"],
    },
    {
      site: "MTGGoldfish",
      text: [
        "Commander",
        "1 Atraxa, Praetors' Voice",
        "",
        "Deck",
        "1 Sol Ring",
        "1 Swords to Plowshares",
      ].join("\n"),
      cardLines: 3,
      commanders: ["Atraxa, Praetors' Voice"],
    },
    {
      site: "EDHREC-ish plain list with DFCs",
      text: "1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki\n1 Malakir Rebirth // Malakir Mire\n1 Sol Ring",
      cardLines: 3,
      commanders: [],
    },
    {
      site: "bare names, no quantities",
      text: "Sol Ring\nArcane Signet\nCommand Tower",
      cardLines: 3,
      commanders: [],
    },
  ];

  for (const paste of PASTES) {
    it(`tokenizes: ${paste.site}`, () => {
      const { lines, warnings } = parseMtgDecklist(paste.text);
      expect(warnings).toEqual([]);
      expect(lines).toHaveLength(paste.cardLines);
      expect(lines.filter((l) => l.zoneHint === "commander").map((l) => l.rawName)).toEqual(
        paste.commanders,
      );
      for (const line of lines) expect(line.qty).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("serializeMtgDecklist", () => {
  it("emits zone sections that parse back to the same cards", () => {
    const deck = commanderDeck([atraxa], [entry(solRing), entry(island, 30)]);
    const text = serializeMtgDecklist(deck, cardMap([atraxa, solRing, island]));

    expect(text).toContain("Commander\n1 Atraxa, Praetors' Voice");
    expect(text).toContain("30 Island");

    // Headers are chosen so zones survive a round trip through parse.
    const roundTrip = parseMtgDecklist(text);
    expect(roundTrip.warnings).toEqual([]);
    expect(roundTrip.lines).toEqual([
      { rawName: "Atraxa, Praetors' Voice", qty: 1, zoneHint: "commander" },
      { rawName: "Island", qty: 30, zoneHint: "main" },
      { rawName: "Sol Ring", qty: 1, zoneHint: "main" },
    ]);
  });
});
