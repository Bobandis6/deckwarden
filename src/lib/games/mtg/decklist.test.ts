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
