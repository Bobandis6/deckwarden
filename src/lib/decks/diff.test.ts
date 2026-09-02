import { describe, expect, it } from "vitest";

import { diffDeckLists, diffSummary, isEmptyDiff, type FrozenCard } from "./diff";

const c = (cardId: string, zone: string, qty = 1, extra: Partial<FrozenCard> = {}): FrozenCard => ({
  cardId,
  zone,
  qty,
  tags: [],
  printingId: null,
  ...extra,
});

describe("diffDeckLists", () => {
  it("reports no changes for identical lists (order-insensitive)", () => {
    const before = [c("cmd", "commander"), c("a", "main"), c("b", "main", 3)];
    const after = [c("b", "main", 3), c("a", "main"), c("cmd", "commander")];
    const diff = diffDeckLists(before, after);
    expect(isEmptyDiff(diff)).toBe(true);
    expect(diff.unchanged).toBe(3);
    expect(diffSummary(diff)).toBe("No card changes");
  });

  it("classifies added, removed, and quantity changes per zone", () => {
    const before = [c("cmd", "commander"), c("sol", "main"), c("plains", "main", 3)];
    const after = [c("cmd", "commander"), c("rhystic", "main"), c("plains", "main", 5)];
    const diff = diffDeckLists(before, after);
    expect(diff.added).toEqual([{ cardId: "rhystic", zone: "main", qty: 1 }]);
    expect(diff.removed).toEqual([{ cardId: "sol", zone: "main", qty: 1 }]);
    expect(diff.qtyChanged).toEqual([{ cardId: "plains", zone: "main", from: 3, to: 5 }]);
    expect(diff.moved).toEqual([]);
    expect(diff.unchanged).toBe(1);
    expect(diffSummary(diff)).toBe("+1 · -1 · 1 qty");
  });

  it("pairs a same-quantity zone change into one move", () => {
    const before = [c("x", "commander"), c("y", "main")];
    const after = [c("y", "commander"), c("x", "main")];
    const diff = diffDeckLists(before, after);
    expect(diff.moved).toEqual([
      { cardId: "x", fromZone: "commander", toZone: "main", qty: 1 },
      { cardId: "y", fromZone: "main", toZone: "commander", qty: 1 },
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diffSummary(diff)).toBe("2 moved");
  });

  it("keeps a zone change with a different quantity as two raw changes", () => {
    const before = [c("x", "side", 2)];
    const after = [c("x", "main", 3)];
    const diff = diffDeckLists(before, after);
    expect(diff.moved).toEqual([]);
    expect(diff.removed).toEqual([{ cardId: "x", zone: "side", qty: 2 }]);
    expect(diff.added).toEqual([{ cardId: "x", zone: "main", qty: 3 }]);
  });

  it("pairs at most one move per removal: a split becomes move + add", () => {
    const before = [c("x", "a")];
    const after = [c("x", "b"), c("x", "c")];
    const diff = diffDeckLists(before, after);
    expect(diff.moved).toEqual([{ cardId: "x", fromZone: "a", toZone: "b", qty: 1 }]);
    expect(diff.added).toEqual([{ cardId: "x", zone: "c", qty: 1 }]);
  });

  it("ignores tag and printing differences by design", () => {
    const before = [c("a", "main", 1, { tags: ["Ramp"], printingId: "p1" })];
    const after = [c("a", "main", 1, { tags: ["Draw"], printingId: "p2" })];
    expect(isEmptyDiff(diffDeckLists(before, after))).toBe(true);
  });

  it("treats an empty side as all-added / all-removed", () => {
    const list = [c("a", "main"), c("b", "main", 2)];
    expect(diffDeckLists([], list).added).toHaveLength(2);
    expect(diffDeckLists(list, []).removed).toHaveLength(2);
    expect(diffSummary(diffDeckLists(list, []))).toBe("-3");
  });

  it("sorts output deterministically by zone then card id", () => {
    const after = [c("z", "main"), c("a", "main"), c("m", "commander")];
    const diff = diffDeckLists([], after);
    expect(diff.added.map((e) => `${e.zone}:${e.cardId}`)).toEqual([
      "commander:m",
      "main:a",
      "main:z",
    ]);
  });

  it("collapses duplicate keys in a malformed input instead of double-counting", () => {
    const before = [c("a", "main", 1), c("a", "main", 2)];
    const after = [c("a", "main", 3)];
    expect(isEmptyDiff(diffDeckLists(before, after))).toBe(true);
  });
});
