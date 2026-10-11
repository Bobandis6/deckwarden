/**
 * Y9b — the opponents field's pure rules: the wire is each opponent's keys
 * in the order picked; a smaller table drops opponents past pod − 1 (and a
 * second box under them); typed text on screen that no pick backs is what
 * stops a log.
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_BOXES,
  fitOpponents,
  hasUnpickedText,
  opponentsWire,
  type Opponent,
} from "./opponents-field";

const a = { key: "aaaa", name: "Atraxa" };
const k = { key: "kkkk", name: "Karlach" };
const g = { key: "gggg", name: "Raised by Giants" };
const table: Opponent[] = [[k, g], [a], [a]];

describe("opponentsWire", () => {
  it("keys only, one entry per opponent, partners as one entry of two", () => {
    expect(opponentsWire(table)).toEqual([["kkkk", "gggg"], ["aaaa"], ["aaaa"]]);
    expect(opponentsWire([])).toEqual([]);
  });
});

describe("fitOpponents", () => {
  it("keeps at most pod − 1 opponents", () => {
    expect(fitOpponents(table, EMPTY_BOXES, 4).opponents).toEqual(table);
    expect(fitOpponents(table, EMPTY_BOXES, 3).opponents).toEqual([[k, g], [a]]);
    expect(fitOpponents(table, EMPTY_BOXES, 2).opponents).toEqual([[k, g]]);
    expect(fitOpponents(table, EMPTY_BOXES, 1).opponents).toEqual([]);
  });

  it("a second box under a dropped opponent closes and forgets its text; one above stays", () => {
    const open = { ...EMPTY_BOXES, secondFor: 1, second: "tym" };
    expect(fitOpponents(table, open, 2).boxes).toEqual({ ...open, secondFor: null, second: "" });
    expect(fitOpponents(table, open, 3).boxes).toBe(open);
  });
});

describe("hasUnpickedText", () => {
  it("text in the next box counts only while that box shows", () => {
    const boxes = { ...EMPTY_BOXES, next: "atr" };
    expect(hasUnpickedText([], boxes, 3)).toBe(true);
    expect(hasUnpickedText([[a], [k], [a]], boxes, 3)).toBe(false);
    expect(hasUnpickedText([], { ...boxes, next: "   " }, 3)).toBe(false);
  });

  it("text in an open second box counts; a closed one's never does", () => {
    expect(hasUnpickedText([[k]], { ...EMPTY_BOXES, secondFor: 0, second: "rai" }, 3)).toBe(true);
    expect(hasUnpickedText([[k]], { ...EMPTY_BOXES, secondFor: null, second: "rai" }, 3)).toBe(
      false,
    );
  });
});
