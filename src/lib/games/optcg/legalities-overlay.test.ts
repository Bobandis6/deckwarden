/**
 * P4.2 — parse + diff for the hand-maintained banlist overlay. The parser is
 * deliberately strict: the file is hand-edited, so typos fail loudly before
 * any row is touched.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  diffOverlay,
  normalizeCondition,
  parseOverlay,
  type CurrentRow,
  type OverlayEntry,
} from "./legalities-overlay";

function base(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    game: "optcg",
    format: "standard",
    source_url: "https://en.onepiece-cardgame.com/news/restriction.html",
    retrieved: "2026-09-04",
    entries: [],
    ...over,
  };
}

describe("parseOverlay", () => {
  it("parses the real in-repo overlay file", () => {
    const raw = JSON.parse(
      readFileSync(path.join(process.cwd(), "data/optcg/legalities.json"), "utf8"),
    ) as unknown;
    const overlay = parseOverlay(raw);
    expect(overlay.format).toBe("standard");
    expect(overlay.entries.length).toBeGreaterThanOrEqual(10);
    // The five unconditional bans from Bandai's 2026-04-10 list.
    const banned = overlay.entries.filter((e) => e.status === "banned" && !e.condition);
    expect(banned.map((e) => e.cardId).sort()).toEqual([
      "OP03-040",
      "OP06-047",
      "OP06-086",
      "OP06-116",
      "ST10-001",
    ]);
    // Pair conditions are mirrored (the parser enforces it, but pin the count).
    const pairs = overlay.entries.filter((e) => e.condition?.type === "banned_with");
    expect(pairs).toHaveLength(5); // 3 pairs; Luffy carries two partners in one entry
  });

  it("rejects bad card numbers, statuses, dates and one-sided pairs", () => {
    expect(() =>
      parseOverlay(
        base({ entries: [{ cardId: "luffy", status: "banned", effectiveFrom: "2026-01-01" }] }),
      ),
    ).toThrow(/card number/);
    expect(() =>
      parseOverlay(
        base({ entries: [{ cardId: "OP01-001", status: "illegal", effectiveFrom: "2026-01-01" }] }),
      ),
    ).toThrow(/status/);
    expect(() =>
      parseOverlay(
        base({ entries: [{ cardId: "OP01-001", status: "banned", effectiveFrom: "01/01/2026" }] }),
      ),
    ).toThrow(/effectiveFrom/);
    expect(() =>
      parseOverlay(
        base({
          entries: [
            {
              cardId: "OP01-001",
              status: "banned",
              effectiveFrom: "2026-01-01",
              condition: { type: "banned_with", cardIds: ["OP01-002"] },
            },
          ],
        }),
      ),
    ).toThrow(/one-sided/);
    expect(() => parseOverlay(base({ game: "mtg" }))).toThrow(/optcg/);
  });
});

describe("normalizeCondition", () => {
  it("is stable across key order and cardIds order", () => {
    expect(normalizeCondition({ type: "banned_with", cardIds: ["B-1", "A-1"] })).toBe(
      normalizeCondition({ cardIds: ["A-1", "B-1"], type: "banned_with" } as never),
    );
    expect(normalizeCondition(null)).toBe("");
  });
});

describe("diffOverlay", () => {
  const bannedEntry: OverlayEntry = {
    cardId: "OP06-116",
    status: "banned",
    effectiveFrom: "2026-04-10",
  };
  const pairEntry: OverlayEntry = {
    cardId: "OP07-115",
    status: "banned",
    effectiveFrom: "2026-04-10",
    condition: { type: "banned_with", cardIds: ["EB04-058"] },
  };

  it("opens everything against an empty table", () => {
    const { closeRowIds, openEntries } = diffOverlay([bannedEntry, pairEntry], []);
    expect(closeRowIds).toEqual([]);
    expect(openEntries).toHaveLength(2);
  });

  it("is a no-op when rows already match (condition order-insensitive)", () => {
    const current: CurrentRow[] = [
      { rowId: 1, cardId: "OP06-116", status: "banned", condition: null },
      {
        rowId: 2,
        cardId: "OP07-115",
        status: "banned",
        condition: { cardIds: ["EB04-058"], type: "banned_with" },
      },
    ];
    const { closeRowIds, openEntries } = diffOverlay([bannedEntry, pairEntry], current);
    expect(closeRowIds).toEqual([]);
    expect(openEntries).toEqual([]);
  });

  it("closes dropped rows and reopens changed ones (unban + status change)", () => {
    const current: CurrentRow[] = [
      { rowId: 1, cardId: "OP06-116", status: "banned", condition: null },
      { rowId: 2, cardId: "OP03-040", status: "banned", condition: null },
    ];
    // OP06-116 becomes restricted; OP03-040 is unbanned (dropped from overlay).
    const { closeRowIds, openEntries } = diffOverlay(
      [{ ...bannedEntry, status: "restricted" }],
      current,
    );
    expect(closeRowIds.sort()).toEqual([1, 2]);
    expect(openEntries).toEqual([{ ...bannedEntry, status: "restricted" }]);
  });

  it("treats a condition change as close + open", () => {
    const current: CurrentRow[] = [
      {
        rowId: 5,
        cardId: "OP11-040",
        status: "banned",
        condition: { type: "banned_with", cardIds: ["OP11-067"] },
      },
    ];
    const widened: OverlayEntry = {
      cardId: "OP11-040",
      status: "banned",
      effectiveFrom: "2026-04-10",
      condition: { type: "banned_with", cardIds: ["OP11-067", "OP08-069"] },
    };
    const { closeRowIds, openEntries } = diffOverlay([widened], current);
    expect(closeRowIds).toEqual([5]);
    expect(openEntries).toEqual([widened]);
  });
});
