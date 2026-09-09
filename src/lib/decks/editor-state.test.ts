import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import {
  addCard,
  deckSizeCount,
  MAX_QTY,
  MAX_TAGS,
  normalizeTags,
  parseQuickAdd,
  removeCard,
  replaceLeader,
  setQty,
  setTags,
  singleQtyIncrease,
  toSavePayload,
  zoneQty,
  type EditorEntry,
} from "./editor-state";
import { optcgAdapter } from "@/lib/games/optcg/adapter";

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

describe("tags", () => {
  it("normalizeTags trims, drops empties, and dedupes case-insensitively", () => {
    expect(normalizeTags([" Ramp ", "ramp", "", "  ", "Draw"])).toEqual(["Ramp", "Draw"]);
  });

  it("normalizeTags enforces the PUT route's bounds", () => {
    const long = "x".repeat(60);
    expect(normalizeTags([long])[0]).toHaveLength(40);
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });

  it("setTags replaces exactly the addressed entry's tags", () => {
    const start = [entry({ cardId: "a" }), entry({ cardId: "b", tags: ["keep"] })];
    const next = setTags(start, "main", "a", ["Ramp", "ramp "]);
    expect(next.find((e) => e.cardId === "a")?.tags).toEqual(["Ramp"]);
    expect(next.find((e) => e.cardId === "b")?.tags).toEqual(["keep"]);
    // unknown entry → structural no-op
    expect(setTags(start, "commander", "a", ["x"])).toEqual(start);
  });
});

const STANDARD = optcgAdapter.formats[0];

describe("replaceLeader (R3 — the max-1 leader zone swap)", () => {
  it("adds into an empty leader zone with nothing replaced", () => {
    const result = replaceLeader([entry({ cardId: "op01-025" })], STANDARD, "leader", "enel");
    expect(result.error).toBeUndefined();
    expect(result.replaced).toBeNull();
    expect(result.entries).toEqual([
      entry({ cardId: "op01-025" }),
      { cardId: "enel", zone: "leader", qty: 1, tags: [] },
    ]);
  });

  it("swaps the occupant out and names it, leaving the main zone alone", () => {
    const before = [
      entry({ cardId: "enel", zone: "leader" }),
      entry({ cardId: "op01-025", qty: 4 }),
    ];
    const result = replaceLeader(before, STANDARD, "leader", "nami");
    expect(result.replaced).toBe("enel");
    expect(result.entries).toEqual([
      entry({ cardId: "op01-025", qty: 4 }),
      { cardId: "nami", zone: "leader", qty: 1, tags: [] },
    ]);
    // Undo = the same call with the previous id.
    const undone = replaceLeader(result.entries, STANDARD, "leader", "enel");
    expect(undone.replaced).toBe("nami");
    expect(undone.entries.filter((e) => e.zone === "leader").map((e) => e.cardId)).toEqual([
      "enel",
    ]);
  });

  it("is a no-op when the same card already leads", () => {
    const before = [entry({ cardId: "enel", zone: "leader" })];
    const result = replaceLeader(before, STANDARD, "leader", "enel");
    expect(result.replaced).toBeNull();
    expect(result.entries).toEqual(before);
  });

  it("refuses Magic's two-commander zone (partners keep addCard's full message)", () => {
    const before = [entry({ cardId: "thrasios", zone: "commander" })];
    const result = replaceLeader(before, COMMANDER, "commander", "tymna");
    expect(result.error).toBe("Commander is not a single-card zone");
    expect(result.entries).toEqual(before);
    expect(addCard(before, COMMANDER, "commander", "tymna", 1).error).toBeUndefined();
    const two = addCard(before, COMMANDER, "commander", "tymna", 1).entries;
    expect(addCard(two, COMMANDER, "commander", "kraum", 1).error).toBe(
      "Commander is full (max 2 cards)",
    );
  });

  it("refuses an unknown zone", () => {
    expect(replaceLeader([], STANDARD, "sideboard", "x").error).toBe('Unknown zone "sideboard"');
  });
});

describe("singleQtyIncrease (the badge pop)", () => {
  it("names the one row whose quantity grew — a new entry or an increment", () => {
    const a = [entry({ cardId: "sol" })];
    expect(singleQtyIncrease([], a)).toBe("main:sol");
    expect(singleQtyIncrease(a, [entry({ cardId: "sol", qty: 4 })])).toBe("main:sol");
  });

  it("is null for decreases, no change, or several changes at once (imports)", () => {
    const a = [entry({ cardId: "sol", qty: 4 })];
    expect(singleQtyIncrease(a, [entry({ cardId: "sol", qty: 3 })])).toBeNull();
    expect(singleQtyIncrease(a, a)).toBeNull();
    expect(
      singleQtyIncrease(a, [entry({ cardId: "sol", qty: 5 }), entry({ cardId: "sig" })]),
    ).toBeNull();
  });
});
