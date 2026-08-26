import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";

import { cardListIssues, leaderDenorm, type DeckCardInput } from "./cards";

const entry = (over: Partial<DeckCardInput>): DeckCardInput => ({
  cardId: "card-a",
  zone: "main",
  qty: 1,
  tags: [],
  ...over,
});

describe("cardListIssues", () => {
  it("accepts a normal commander list shape", () => {
    const entries = [
      entry({ cardId: "cmd", zone: "commander" }),
      entry({ cardId: "card-a" }),
      entry({ cardId: "card-b", qty: 30 }),
    ];
    expect(cardListIssues(entries, COMMANDER)).toEqual([]);
  });

  it("accepts an empty list (deck in progress) — minimums are P1.4's business", () => {
    expect(cardListIssues([], COMMANDER)).toEqual([]);
  });

  it("flags unknown zones", () => {
    const issues = cardListIssues([entry({ zone: "sideboard" })], COMMANDER);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Unknown zone "sideboard"/);
  });

  it("flags duplicate (zone, card) pairs", () => {
    const issues = cardListIssues([entry({}), entry({ qty: 2 })], COMMANDER);
    expect(issues.some((i) => /Duplicate entry/.test(i))).toBe(true);
  });

  it("allows the same card in two different zones", () => {
    const entries = [entry({ zone: "commander" }), entry({ zone: "main" })];
    expect(cardListIssues(entries, COMMANDER)).toEqual([]);
  });

  it("enforces zone maximums by quantity (3 commanders)", () => {
    const issues = cardListIssues([entry({ zone: "commander", qty: 3 })], COMMANDER);
    expect(issues.some((i) => /"commander" holds 3.*maximum is 2/.test(i))).toBe(true);
  });
});

describe("leaderDenorm", () => {
  it("collects leader-zone cards in order and ORs their color identity", () => {
    const entries = [
      entry({ cardId: "partner-1", zone: "commander" }),
      entry({ cardId: "partner-2", zone: "commander" }),
      entry({ cardId: "card-a", zone: "main" }),
    ];
    const ci = new Map([
      ["partner-1", 0b00011], // WU
      ["partner-2", 0b01000], // R
      ["card-a", 0b10000], // main-deck card never contributes
    ]);
    expect(leaderDenorm(entries, COMMANDER, ci)).toEqual({
      leaderIds: ["partner-1", "partner-2"],
      ciMask: 0b01011,
    });
  });

  it("is empty/zero with no leader-zone entries", () => {
    expect(leaderDenorm([entry({})], COMMANDER, new Map())).toEqual({
      leaderIds: [],
      ciMask: 0,
    });
  });
});
