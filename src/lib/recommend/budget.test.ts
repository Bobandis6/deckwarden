import { describe, expect, it } from "vitest";

import { BUDGET_OPTIONS, withinBudget } from "./budget";

describe("one budget vocabulary (Y1)", () => {
  it("offers All · ≤ $5 a card · ≤ $1 a card", () => {
    expect(BUDGET_OPTIONS.map((o) => o.label)).toEqual(["All", "≤ $5 a card", "≤ $1 a card"]);
  });

  it("is inclusive at the line and never passes an unpriced card", () => {
    expect(withinBudget(5, "5")).toBe(true);
    expect(withinBudget(5.01, "5")).toBe(false);
    expect(withinBudget(1, "1")).toBe(true);
    expect(withinBudget(null, "1")).toBe(false);
    expect(withinBudget(null, "all")).toBe(true);
    expect(withinBudget(250, "all")).toBe(true);
  });
});
