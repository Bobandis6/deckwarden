import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";

import { cardListIssues, leaderDenorm, tokenZoneIssues, type DeckCardInput } from "./cards";

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

describe("tokenZoneIssues (DECK-TOKENS)", () => {
  const tokens = new Set(["treasure", "monarch"]);
  const isToken = (id: string) => tokens.has(id);

  it("a 100 with its tokens beside it is fine; the tokens zone has no maximum", () => {
    const entries = [
      entry({ cardId: "cmd", zone: "commander" }),
      entry({ cardId: "card-a", qty: 99 }),
      entry({ cardId: "treasure", zone: "tokens", qty: 12 }),
      entry({ cardId: "monarch", zone: "tokens" }),
    ];
    expect(tokenZoneIssues(entries, COMMANDER, isToken)).toEqual([]);
    expect(cardListIssues(entries, COMMANDER)).toEqual([]);
  });

  it("refuses a token in the 100 — main or the command zone", () => {
    const issues = tokenZoneIssues(
      [entry({ cardId: "treasure" }), entry({ cardId: "monarch", zone: "commander" })],
      COMMANDER,
      isToken,
    );
    expect(issues).toEqual([
      'Card treasure is a token, which zone "main" can\'t hold',
      'Card monarch is a token, which zone "commander" can\'t hold',
    ]);
  });

  it("refuses a card in the tokens zone — it is no maybeboard", () => {
    expect(
      tokenZoneIssues([entry({ cardId: "card-a", zone: "tokens" })], COMMANDER, isToken),
    ).toEqual(['Card card-a is not a token; zone "tokens" holds tokens only']);
  });

  it("leaves unknown zones to cardListIssues", () => {
    expect(
      tokenZoneIssues([entry({ cardId: "treasure", zone: "sideboard" })], COMMANDER, isToken),
    ).toEqual([]);
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
