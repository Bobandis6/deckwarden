import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/games/registry";
import type { BracketQuestion, BracketRead } from "@/lib/games/types";

import { targetInBands } from "./target-bands";

const brackets = getAdapter("mtg").brackets!;

function read(over: Partial<BracketRead> = {}): BracketRead {
  return {
    status: "read",
    minimum: 1,
    suggested: null,
    factors: [],
    assumptions: [],
    review: [],
    blockedBy: [],
    conflicts: [],
    ruleset: { version: 1, asOf: "2025-11-05" },
    answersStale: false,
    ...over,
  };
}

const call = (raisesTo: number): BracketQuestion => ({
  id: `combo:${raisesTo}`,
  question: "Can this combo win or lock the game before turn 6?",
  because: "",
  cards: [],
  source: "Commander Spellbook",
  raisesTo,
  answer: null,
});

describe("targetInBands — a target the read's own line already names (BRACKET-UP's door)", () => {
  it("a list nothing flags reads 1 to 2: targets 1 and 2 are met, 3 and up are not", () => {
    expect([1, 2, 3, 4, 5].map((t) => targetInBands(brackets, read(), t))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("a floor of 3: only 3 is met", () => {
    expect([2, 3, 4].map((t) => targetInBands(brackets, read({ minimum: 3 }), t))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("a pending call that could raise the read to 4 meets a target of 4 (the player's answer settles it)", () => {
    const open = read({ status: "review", minimum: 3, review: [call(4)] });
    expect(targetInBands(brackets, open, 4)).toBe(true);
    expect(targetInBands(brackets, open, 5)).toBe(false);
  });

  it("answers that raised the read: the suggested level is the one named", () => {
    expect(targetInBands(brackets, read({ minimum: 1, suggested: 3 }), 3)).toBe(true);
    expect(targetInBands(brackets, read({ minimum: 1, suggested: 3 }), 4)).toBe(false);
  });

  it("a read whose line names no level (a draft, a blocked list) meets nothing here", () => {
    expect(targetInBands(brackets, read({ status: "draft" }), 2)).toBe(false);
    expect(targetInBands(brackets, read({ status: "blocked" }), 2)).toBe(false);
  });
});
