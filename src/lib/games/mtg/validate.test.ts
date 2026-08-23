import { describe, expect, it } from "vitest";

import type { ValidationIssue } from "../types";
import { copyLimit, isLegalPair, validateMtg } from "./validate";
import {
  atraxa,
  cardMap,
  commanderDeck,
  entry,
  flash,
  island,
  legalDeck,
  lightningBolt,
  previewCard,
  raisedByGiants,
  relentlessRats,
  sevenDwarves,
  solRing,
  thrasios,
  tymna,
  wilson,
} from "./test-fixtures";

const codes = (issues: ValidationIssue[]) => issues.map((i) => i.code);

describe("validateMtg", () => {
  it("passes a legal 100-card commander deck with zero issues", () => {
    const { deck, cards } = legalDeck();
    expect(validateMtg(deck, cards)).toEqual([]);
  });

  it("errors on unknown format", () => {
    const { deck, cards } = legalDeck();
    expect(codes(validateMtg({ ...deck, formatCode: "standard" }, cards))).toEqual([
      "FORMAT_UNKNOWN",
    ]);
  });

  it("flags wrong deck size", () => {
    const { deck, cards } = legalDeck();
    deck.zones.main = deck.zones.main.slice(1); // 99 total
    expect(codes(validateMtg(deck, cards))).toContain("DECK_SIZE");
  });

  it("flags an empty commander zone as ZONE_SIZE", () => {
    const { deck, cards } = legalDeck();
    deck.zones.commander = [];
    const issues = validateMtg(deck, cards);
    expect(codes(issues)).toContain("ZONE_SIZE");
    expect(issues.find((i) => i.code === "ZONE_SIZE")?.zone).toBe("commander");
  });

  it("flags zones the format doesn't define", () => {
    const { deck, cards } = legalDeck();
    deck.zones.sideboard = [entry(solRing)];
    expect(codes(validateMtg(deck, cards))).toContain("ZONE_UNKNOWN");
  });

  it("flags cards missing from the card map", () => {
    const deck = commanderDeck([atraxa], [{ cardId: "missing-id", qty: 1, tags: [] }]);
    expect(codes(validateMtg(deck, cardMap([atraxa])))).toContain("UNKNOWN_CARD");
  });

  it("rejects cards outside the commander's color identity", () => {
    const deck = commanderDeck([atraxa], [entry(lightningBolt)]);
    const issues = validateMtg(deck, cardMap([atraxa, lightningBolt]));
    const ci = issues.find((i) => i.code === "COLOR_IDENTITY");
    expect(ci?.cardIds).toEqual([lightningBolt.id]);
    expect(ci?.severity).toBe("error");
  });

  it("accepts cards within the UNION of two partners' identities", () => {
    // Thrasios (GU) + Tymna (WB) → WUBG; Bolt (R) still outside.
    const deck = commanderDeck([thrasios, tymna], [entry(island), entry(lightningBolt)]);
    const issues = validateMtg(deck, cardMap([thrasios, tymna, island, lightningBolt]));
    expect(issues.find((i) => i.code === "COLOR_IDENTITY")?.cardIds).toEqual([lightningBolt.id]);
  });

  it("rejects a non-legendary as commander", () => {
    const deck = commanderDeck([solRing], []);
    expect(codes(validateMtg(deck, cardMap([solRing])))).toContain("COMMANDER_INELIGIBLE");
  });

  it("allows Partner pairs and Background pairs, rejects arbitrary pairs", () => {
    expect(isLegalPair(thrasios, tymna)).toBe(true);
    expect(isLegalPair(wilson, raisedByGiants)).toBe(true);
    expect(isLegalPair(raisedByGiants, wilson)).toBe(true); // order-insensitive
    expect(isLegalPair(atraxa, tymna)).toBe(false);

    const deck = commanderDeck([atraxa, tymna], []);
    expect(codes(validateMtg(deck, cardMap([atraxa, tymna])))).toContain("COMMANDER_PAIR");
  });

  it("enforces singleton but exempts basics and any-number cards", () => {
    const deck = commanderDeck(
      [atraxa],
      [entry(solRing, 2), entry(island, 30), entry(relentlessRats, 40)],
    );
    const issues = validateMtg(deck, cardMap([atraxa, solRing, island, relentlessRats]));
    const copy = issues.filter((i) => i.code === "COPY_LIMIT");
    expect(copy).toHaveLength(1);
    expect(copy[0].cardIds).toEqual([solRing.id]);
  });

  it('honors "up to seven" style limits', () => {
    expect(copyLimit(sevenDwarves)).toBe(7);
    const ok = commanderDeck([atraxa], [entry(sevenDwarves, 7)]);
    const over = commanderDeck([atraxa], [entry(sevenDwarves, 8)]);
    const cards = cardMap([atraxa, sevenDwarves]);
    expect(codes(validateMtg(ok, cards))).not.toContain("COPY_LIMIT");
    expect(codes(validateMtg(over, cards))).toContain("COPY_LIMIT");
  });

  it("errors on banned cards (unconditional legality row)", () => {
    const deck = commanderDeck([atraxa], [entry(flash)]);
    const banned = validateMtg(deck, cardMap([atraxa, flash])).find((i) => i.code === "BANNED");
    expect(banned?.severity).toBe("error");
    expect(banned?.cardIds).toEqual([flash.id]);
  });

  it("turns preview + not_legal into a NOT_RELEASED warning, not an error", () => {
    const deck = commanderDeck([atraxa], [entry(previewCard)]);
    const issues = validateMtg(deck, cardMap([atraxa, previewCard]));
    const preview = issues.find((i) => i.code === "NOT_RELEASED");
    expect(preview?.severity).toBe("warning");
    expect(codes(issues)).not.toContain("NOT_LEGAL");
  });

  it("errors NOT_LEGAL for non-preview not_legal cards", () => {
    const notLegal = { ...previewCard, id: "not-legal-id", isPreview: false };
    const deck = commanderDeck([atraxa], [entry(notLegal)]);
    const issue = validateMtg(deck, cardMap([atraxa, notLegal])).find(
      (i) => i.code === "NOT_LEGAL",
    );
    expect(issue?.severity).toBe("error");
  });

  it("counts copy limits across commander and main zones together", () => {
    const deck = commanderDeck([atraxa], [entry(atraxa)]);
    expect(codes(validateMtg(deck, cardMap([atraxa])))).toContain("COPY_LIMIT");
  });
});
