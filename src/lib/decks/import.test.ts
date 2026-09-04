import { describe, expect, it } from "vitest";

import type { CardWire } from "@/lib/decks/editor-state";
import { applyImport, buildImportItems, defaultZoneId, type Resolution } from "@/lib/decks/import";
import { COMMANDER } from "@/lib/games/mtg/formats";

let n = 0;
function wire(name: string): CardWire {
  return {
    id: `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`,
    name,
    externalKey: `oracle-${n}`,
    primaryType: "Creature",
    costValue: 2,
    colorsMask: 0,
    ciMask: 0,
    isLeaderCandidate: false,
    isPreview: false,
    cheapestUsd: null,
    popularity: null,
    attrs: {},
    image: null,
  };
}

const atraxa = wire("Atraxa, Praetors' Voice");
const solRing = wire("Sol Ring");
const island = wire("Island");

function resolutions(pairs: [string, CardWire | null][]): Resolution[] {
  return pairs.map(([input, match]) => ({ input, match, suggestions: [] }));
}

describe("buildImportItems", () => {
  it("maps zone hints to format zones, default zone when unhinted, null when unknown", () => {
    const items = buildImportItems(
      COMMANDER,
      [
        { rawName: "Atraxa, Praetors' Voice", qty: 1, zoneHint: "commander" },
        { rawName: "Sol Ring", qty: 1 },
        { rawName: "Swords to Plowshares", qty: 1, zoneHint: "sideboard" },
      ],
      resolutions([
        ["Atraxa, Praetors' Voice", atraxa],
        ["Sol Ring", solRing],
        ["Swords to Plowshares", null],
      ]),
    );
    expect(defaultZoneId(COMMANDER)).toBe("main");
    expect(items.map((i) => i.zone)).toEqual(["commander", "main", null]);
    expect(items.map((i) => i.card?.name ?? null)).toEqual([
      "Atraxa, Praetors' Voice",
      "Sol Ring",
      null,
    ]);
  });
});

describe("applyImport", () => {
  const items = buildImportItems(
    COMMANDER,
    [
      { rawName: "Atraxa, Praetors' Voice", qty: 1, zoneHint: "commander" },
      { rawName: "Sol Ring", qty: 1 },
      { rawName: "Island", qty: 30 },
    ],
    resolutions([
      ["Atraxa, Praetors' Voice", atraxa],
      ["Sol Ring", solRing],
      ["Island", island],
    ]),
  );

  it("replace mode builds a fresh list", () => {
    const existing = [{ cardId: "old", zone: "main", qty: 5, tags: [] }];
    const { entries, cards, warnings } = applyImport(existing, items, COMMANDER, "replace");
    expect(warnings).toEqual([]);
    expect(entries).toEqual([
      { cardId: atraxa.id, zone: "commander", qty: 1, tags: [] },
      { cardId: solRing.id, zone: "main", qty: 1, tags: [] },
      { cardId: island.id, zone: "main", qty: 30, tags: [] },
    ]);
    expect(cards.map((c) => c.name)).toContain("Island");
  });

  it("add mode merges quantities into existing entries", () => {
    const existing = [{ cardId: island.id, zone: "main", qty: 2, tags: ["mana"] }];
    const { entries } = applyImport(existing, items, COMMANDER, "add");
    const islandEntry = entries.find((e) => e.cardId === island.id);
    expect(islandEntry).toEqual({ cardId: island.id, zone: "main", qty: 32, tags: ["mana"] });
    expect(entries).toHaveLength(3);
  });

  it("merges duplicate lines within one paste", () => {
    const dup = buildImportItems(
      COMMANDER,
      [
        { rawName: "Sol Ring", qty: 1 },
        { rawName: "Sol Ring", qty: 2 },
      ],
      resolutions([["Sol Ring", solRing]]),
    );
    const { entries } = applyImport([], dup, COMMANDER, "replace");
    expect(entries).toEqual([{ cardId: solRing.id, zone: "main", qty: 3, tags: [] }]);
  });

  it("spills commander-zone overflow into the main deck with a warning", () => {
    const kenrith = wire("Kenrith, the Returned King");
    const thrasios = wire("Thrasios, Triton Hero");
    const overfull = buildImportItems(
      COMMANDER,
      [
        { rawName: "Atraxa, Praetors' Voice", qty: 1, zoneHint: "commander" },
        { rawName: "Kenrith, the Returned King", qty: 1, zoneHint: "commander" },
        { rawName: "Thrasios, Triton Hero", qty: 1, zoneHint: "commander" },
      ],
      resolutions([
        ["Atraxa, Praetors' Voice", atraxa],
        ["Kenrith, the Returned King", kenrith],
        ["Thrasios, Triton Hero", thrasios],
      ]),
    );
    const { entries, warnings } = applyImport([], overfull, COMMANDER, "replace");
    expect(entries.filter((e) => e.zone === "commander")).toHaveLength(2);
    expect(entries.find((e) => e.cardId === thrasios.id)?.zone).toBe("main");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Commander is full/);
  });

  it("reports unresolved and zoneless lines as skipped warnings", () => {
    const partial = buildImportItems(
      COMMANDER,
      [
        { rawName: "Not A Real Card", qty: 1 },
        { rawName: "Sol Ring", qty: 1, zoneHint: "sideboard" },
      ],
      resolutions([
        ["Not A Real Card", null],
        ["Sol Ring", solRing],
      ]),
    );
    const { entries, warnings, skipped } = applyImport([], partial, COMMANDER, "replace");
    expect(entries).toEqual([]);
    expect(skipped).toHaveLength(2);
    expect(warnings).toEqual([
      'Not found: "Not A Real Card" — skipped',
      'No "sideboard" zone in Commander — skipped Sol Ring',
    ]);
  });
});
