import { describe, expect, it } from "vitest";

import type { CardData, DeckSnapshot, GameAdapter } from "./types";
import { getAdapter, listAdapters } from "./registry";

describe("registry", () => {
  it("serves both adapters behind the plain GameAdapter interface", () => {
    expect(getAdapter("mtg").id).toBe("mtg");
    expect(getAdapter("optcg").id).toBe("optcg");
    expect(listAdapters().map((a) => a.id)).toEqual(["mtg", "optcg"]);
  });

  it("throws for games without an adapter yet", () => {
    expect(() => getAdapter("azuki")).toThrow(/azuki/);
  });
});

describe("optcg stub (the fire drill)", () => {
  // The real assertion is the type annotation in optcg/adapter.ts: the stub
  // must satisfy the FULL interface, proving nothing MTG-specific leaked in.
  const optcg: GameAdapter = getAdapter("optcg");

  const leader: CardData = {
    id: "op-leader-1",
    name: "Monkey.D.Luffy",
    primaryType: "Leader",
    costValue: null,
    colorsMask: 8,
    ciMask: 8,
    isLeaderCandidate: true,
    isPreview: false,
    cheapestUsd: null,
    popularity: null,
    attrs: { category: "leader", traits: ["Straw Hat Crew"], life: 5 },
    legality: [],
  };

  const deck: DeckSnapshot = {
    gameId: "optcg",
    formatCode: "standard",
    zones: { leader: [{ cardId: leader.id, qty: 1, tags: [] }], main: [] },
  };

  it("defines leader/main zones with a 50-card size and 4-copy limit", () => {
    const standard = optcg.formats[0];
    expect(standard.deckSize).toEqual({ min: 50, max: 50 });
    const leaderZone = standard.zones.find((z) => z.id === "leader");
    expect(leaderZone?.countsTowardSize).toBe(false);
    expect(standard.zones.find((z) => z.id === "main")?.defaultCopyLimit).toBe(4);
  });

  it("runs the pure surface end to end", () => {
    expect(optcg.validate(deck, new Map([[leader.id, leader]]))).toEqual([]);
    expect(optcg.analyze(deck, new Map([[leader.id, leader]]))).toEqual([]);

    const { lines, warnings } = optcg.parseDecklist("1xOP01-001\n4 OP01-025\nnot a line?!");
    expect(lines).toEqual([
      { rawName: "OP01-001", qty: 1 },
      { rawName: "OP01-025", qty: 4 },
    ]);
    expect(warnings).toHaveLength(1);

    expect(optcg.serializeDecklist(deck, new Map([[leader.id, leader]]))).toBe("1xMonkey.D.Luffy");
  });

  it("displays Leader vocabulary, not Commander", () => {
    expect(optcg.display.leaderNoun).toBe("Leader");
    expect(optcg.display.subtitle(leader)).toBe("Leader — Straw Hat Crew");
  });
});
