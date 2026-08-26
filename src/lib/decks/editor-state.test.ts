import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import {
  addCard,
  deckSizeCount,
  MAX_QTY,
  parseQuickAdd,
  removeCard,
  setQty,
  toSavePayload,
  zoneQty,
  type EditorEntry,
} from "./editor-state";

const entry = (over: Partial<EditorEntry> & { cardId: string }): EditorEntry => ({
  zone: "main",
  qty: 1,
  tags: [],
  ...over,
});

describe("parseQuickAdd", () => {
  it("parses the `4 Sol Ring` quantity prefix", () => {
    expect(parseQuickAdd("4 Sol Ring")).toEqual({ qty: 4, query: "Sol Ring" });
  });

  it("accepts an x after the count (`4x sol ring`, `10X forest`)", () => {
    expect(parseQuickAdd("4x sol ring")).toEqual({ qty: 4, query: "sol ring" });
    expect(parseQuickAdd("10X forest")).toEqual({ qty: 10, query: "forest" });
  });

  it("treats plain text as qty 1", () => {
    expect(parseQuickAdd("Sol Ring")).toEqual({ qty: 1, query: "Sol Ring" });
    expect(parseQuickAdd("  Arcane Signet  ")).toEqual({ qty: 1, query: "Arcane Signet" });
  });

  it("leaves 3+ digit leading numbers as part of the query", () => {
    expect(parseQuickAdd("1996 World Champion")).toEqual({
      qty: 1,
      query: "1996 World Champion",
    });
  });

  it("keeps a bare number as a query, and clamps qty 0 up to 1", () => {
    expect(parseQuickAdd("4")).toEqual({ qty: 1, query: "4" });
    expect(parseQuickAdd("0 Sol Ring")).toEqual({ qty: 1, query: "Sol Ring" });
  });
});

describe("addCard", () => {
  it("appends a new entry with the requested qty", () => {
    const { entries, error } = addCard([], COMMANDER, "main", "a", 4);
    expect(error).toBeUndefined();
    expect(entries).toEqual([{ cardId: "a", zone: "main", qty: 4, tags: [] }]);
  });

  it("increments an existing (zone, card) entry instead of duplicating", () => {
    const start = [entry({ cardId: "a", qty: 2 })];
    const { entries } = addCard(start, COMMANDER, "main", "a", 3);
    expect(entries).toEqual([entry({ cardId: "a", qty: 5 })]);
  });

  it("caps quantities at MAX_QTY", () => {
    const start = [entry({ cardId: "a", qty: 98 })];
    const { entries } = addCard(start, COMMANDER, "main", "a", 5);
    expect(entries[0].qty).toBe(MAX_QTY);
  });

  it("rejects additions past a zone's card-count maximum", () => {
    const start = [
      entry({ cardId: "a", zone: "commander" }),
      entry({ cardId: "b", zone: "commander" }),
    ];
    const { entries, error } = addCard(start, COMMANDER, "commander", "c", 1);
    expect(error).toMatch(/full/i);
    expect(entries).toHaveLength(2);
  });

  it("rejects unknown zones", () => {
    const { error } = addCard([], COMMANDER, "sideboard", "a", 1);
    expect(error).toMatch(/unknown zone/i);
  });
});

describe("setQty / removeCard", () => {
  it("sets a quantity in place", () => {
    const start = [entry({ cardId: "a", qty: 1 })];
    const { entries } = setQty(start, COMMANDER, "main", "a", 7);
    expect(entries[0].qty).toBe(7);
  });

  it("removes the entry at qty <= 0", () => {
    const start = [entry({ cardId: "a" }), entry({ cardId: "b" })];
    const { entries } = setQty(start, COMMANDER, "main", "a", 0);
    expect(entries).toEqual([entry({ cardId: "b" })]);
  });

  it("respects zone maximums on increase", () => {
    const start = [entry({ cardId: "a", zone: "commander" })];
    const { entries, error } = setQty(start, COMMANDER, "commander", "a", 3);
    expect(error).toMatch(/full/i);
    expect(entries[0].qty).toBe(1);
  });

  it("removeCard drops only the (zone, card) pair", () => {
    const start = [entry({ cardId: "a" }), entry({ cardId: "a", zone: "commander" })];
    expect(removeCard(start, "main", "a")).toEqual([entry({ cardId: "a", zone: "commander" })]);
  });
});

describe("counts and payload", () => {
  it("zoneQty sums quantities per zone", () => {
    const start = [
      entry({ cardId: "a", qty: 4 }),
      entry({ cardId: "b", qty: 2 }),
      entry({ cardId: "c", zone: "commander" }),
    ];
    expect(zoneQty(start, "main")).toBe(6);
    expect(zoneQty(start, "commander")).toBe(1);
  });

  it("deckSizeCount counts countsTowardSize zones (commander included)", () => {
    const start = [entry({ cardId: "a", qty: 99 }), entry({ cardId: "b", zone: "commander" })];
    expect(deckSizeCount(start, COMMANDER)).toBe(100);
  });

  it("toSavePayload matches the PUT body and omits absent printingId", () => {
    const start = [
      entry({ cardId: "a", qty: 2, tags: ["Ramp"] }),
      entry({ cardId: "b", printingId: "p1" }),
    ];
    expect(toSavePayload(start)).toEqual([
      { cardId: "a", zone: "main", qty: 2, tags: ["Ramp"] },
      { cardId: "b", zone: "main", qty: 1, tags: [], printingId: "p1" },
    ]);
    expect("printingId" in toSavePayload(start)[0]).toBe(false);
  });
});
