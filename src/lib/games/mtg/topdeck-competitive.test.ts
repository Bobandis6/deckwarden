import { describe, expect, it } from "vitest";

import { BRACKET_RULESET } from "./bracket-ruleset";
import { COMPETITIVE_LIST_GAME_CHANGERS, isCompetitiveEvent } from "./topdeck-competitive";

const GC = new Set(["gc1", "gc2", "gc3", "gc4", "gc5"]);

const list = (held: number, leaderIds: string[] = ["kinnan"]) => ({
  leaderIds,
  cardIds: [...[...GC].slice(0, held), "sol-ring", "island"],
});

describe("isCompetitiveEvent", () => {
  it("draws its line one past Bracket 3's allowance, from the ruleset", () => {
    const bracket3 = BRACKET_RULESET.levels.find((l) => l.level === 3)!;
    expect(COMPETITIVE_LIST_GAME_CHANGERS).toBe(bracket3.gameChangers! + 1);
    expect(COMPETITIVE_LIST_GAME_CHANGERS).toBe(4);
  });

  it("counts an event whose lists all hold four or more", () => {
    expect(isCompetitiveEvent([list(4), list(5)], GC)).toBe(true);
  });

  it("drops an event whose lists stop at Bracket 3's three, or hold none", () => {
    expect(isCompetitiveEvent([list(3), list(3)], GC)).toBe(false);
    expect(isCompetitiveEvent([list(0), list(0), list(0)], GC)).toBe(false);
  });

  it("counts exactly half, and drops one under it", () => {
    expect(isCompetitiveEvent([list(4), list(0)], GC)).toBe(true);
    expect(isCompetitiveEvent([list(4), list(0), list(0)], GC)).toBe(false);
  });

  it("counts a commander that is a Game Changer", () => {
    expect(isCompetitiveEvent([list(3, ["gc5"])], GC)).toBe(true);
    expect(isCompetitiveEvent([list(3, ["kinnan"])], GC)).toBe(false);
  });

  it("has nothing to count without lists", () => {
    expect(isCompetitiveEvent([], GC)).toBe(false);
  });
});
