import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/games/registry";
import type { BracketQuestion, BracketRead } from "@/lib/games/types";

import { belowTargetBand, callCanRaise } from "./target-bands";

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

const call = (raisesTo: number, answer: BracketQuestion["answer"] = null): BracketQuestion => ({
  id: `combo:${raisesTo}`,
  question: "Can this combo win or lock the game before turn 6?",
  because: "",
  cards: [],
  source: "Commander Spellbook",
  raisesTo,
  answer,
});

describe("belowTargetBand — a target above the band the read's floor is in (BRACKET-UP's door)", () => {
  const at = (r: BracketRead, targets: number[]) =>
    targets.map((t) => belowTargetBand(brackets, r, t));

  it("a list nothing flags reads 1 to 2: targets 1 and 2 are met, 3 and up are above it", () => {
    expect(at(read(), [1, 2, 3, 4, 5])).toEqual([false, false, true, true, true]);
  });

  it("a floor of 3: only a target above 3", () => {
    expect(at(read({ minimum: 3 }), [2, 3, 4])).toEqual([false, false, true]);
  });

  it("a pending call is no floor: a call that could make it 4 still leaves a target of 4 above", () => {
    expect(at(read({ status: "review", minimum: 3, review: [call(4)] }), [3, 4, 5])).toEqual([
      false,
      true,
      true,
    ]);
    // Nothing else flagged: 2 is still met by the "1 to 2" floor.
    expect(at(read({ status: "review", minimum: 1, review: [call(4)] }), [2, 3, 4])).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("answers that raised the read: the suggested level is the floor", () => {
    expect(at(read({ minimum: 1, suggested: 3 }), [3, 4])).toEqual([false, true]);
  });

  it("a read whose line names no level (a list under its size, a blocked list) offers nothing", () => {
    expect(at(read({ status: "draft" }), [2, 3, 4])).toEqual([false, false, false]);
    expect(at(read({ status: "blocked" }), [2, 3, 4])).toEqual([false, false, false]);
    // An incomplete read names its floor only when something raised it.
    expect(at(read({ status: "unavailable" }), [3])).toEqual([false]);
    expect(at(read({ status: "unavailable", minimum: 3 }), [4])).toEqual([true]);
  });
});

describe("callCanRaise — the line names a band above the floor's", () => {
  it("an open call that could raise the read, whatever the floor", () => {
    expect(callCanRaise(brackets, read({ status: "review", minimum: 3, review: [call(4)] }))).toBe(
      true,
    );
    expect(callCanRaise(brackets, read({ status: "review", minimum: 1, review: [call(4)] }))).toBe(
      true,
    );
  });

  it("no call, an answered one, or a call the floor already covers: nothing to raise", () => {
    expect(callCanRaise(brackets, read())).toBe(false);
    expect(callCanRaise(brackets, read({ minimum: 3 }))).toBe(false);
    expect(callCanRaise(brackets, read({ minimum: 3, review: [call(4, "no")] }))).toBe(false);
    expect(callCanRaise(brackets, read({ minimum: 4, review: [call(4)] }))).toBe(false);
    expect(callCanRaise(brackets, read({ status: "draft" }))).toBe(false);
  });
});
