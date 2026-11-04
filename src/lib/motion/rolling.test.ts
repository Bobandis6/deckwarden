/**
 * ROLLING-NUMBERS — the planner on its own: which numbers a line holds,
 * which of them roll from an older line, which way, and which of their
 * characters move; the homes' real lines (the Fit sheet's footer, the cost
 * line, the bracket line, the deck total) as the cases.
 */
import { describe, expect, it } from "vitest";

import { numberRuns, planRoll, ROLL_MS, type RollingRun } from "./rolling";

/** The rolling runs of a plan, without the plain text between them. */
const runs = (parts: ReturnType<typeof planRoll>) =>
  (parts ?? []).filter((p): p is RollingRun => typeof p !== "string");

describe("numberRuns", () => {
  it("reads dollars with their commas and cents, counts and bracket numbers; never a sentence's period", () => {
    expect(numberRuns("The cards coming in cost $1,853.32.")).toEqual([
      { text: "$1,853.32", value: 1853.32, at: 25 },
    ]);
    expect(numberRuns("est. $148 of your $150").map((r) => r.value)).toEqual([148, 150]);
    expect(numberRuns("62 / 100").map((r) => r.text)).toEqual(["62", "100"]);
    expect(numberRuns("Bracket 1 to 2 · nothing here goes past Core").map((r) => r.value)).toEqual([
      1, 2,
    ]);
    expect(numberRuns("Bracket 3, not 4").map((r) => r.text)).toEqual(["3", "4"]);
    expect(numberRuns("Checking combos…")).toEqual([]);
  });
});

describe("planRoll", () => {
  it("the Fit sheet's footer: the estimate rolls down, the digits that kept their value and the total stand", () => {
    const parts = planRoll("est. $172 of your $150", "est. $148 of your $150");
    expect(parts).toEqual([
      "est. ",
      {
        text: "$148",
        dir: "down",
        cells: [
          { char: "$", from: null },
          { char: "1", from: null },
          { char: "4", from: "7" },
          { char: "8", from: "2" },
        ],
      },
      " of your $150",
    ]);
  });

  it("the k-th number rolls from the k-th, so a footer whose words changed still rolls its estimate", () => {
    const [run] = runs(planRoll("Gets you to $172 of your $150", "est. $148 of your $150"));
    expect(run.text).toBe("$148");
    expect(run.dir).toBe("down");
  });

  it("a line that changed its count of numbers changes at once", () => {
    expect(
      planRoll("Bracket 1 to 2 · nothing here goes past Core", "At least Bracket 3 (Upgraded)"),
    ).toBeNull();
    expect(planRoll("You own every card coming in.", "The cards coming in cost $3.10.")).toBeNull();
    expect(planRoll("62 / 100", "Checking combos…")).toBeNull();
  });

  it("the bracket number rolls up a level while the words beside it change at once", () => {
    const parts = planRoll("At least Bracket 3 (Upgraded)", "At least Bracket 4 (Optimized)");
    expect(parts).toEqual([
      "At least Bracket ",
      { text: "4", dir: "up", cells: [{ char: "4", from: "3" }] },
      " (Optimized)",
    ]);
  });

  it("only the numbers that changed roll: a target's read moves, its target stands", () => {
    const parts = planRoll(
      "Your target: Bracket 2 · the cards say at least 3",
      "Your target: Bracket 2 · the cards say at least 4",
    );
    expect(parts).toEqual([
      "Your target: Bracket 2 · the cards say at least ",
      { text: "4", dir: "up", cells: [{ char: "4", from: "3" }] },
    ]);
  });

  it("digits pair by place: $99 to $100 brings the hundreds in from blank, every column up", () => {
    const [run] = runs(planRoll("$99", "$100"));
    expect(run.dir).toBe("up");
    expect(run.cells).toEqual([
      { char: "$", from: null },
      { char: "1", from: "" },
      { char: "0", from: "9" },
      { char: "0", from: "9" },
    ]);
  });

  it("decimals pair from the point, thousands from the right; the comma and the point stand", () => {
    const [run] = runs(
      planRoll("The cards coming in cost $12.34.", "The cards coming in cost $1,205.80."),
    );
    expect(run.cells).toEqual([
      { char: "$", from: null },
      { char: "1", from: "" },
      { char: ",", from: null },
      { char: "2", from: "" },
      { char: "0", from: "1" },
      { char: "5", from: "2" },
      { char: ".", from: null },
      { char: "8", from: "3" },
      { char: "0", from: "4" },
    ]);
  });

  it("the deck total's rule: a change at or under the threshold jumps, above it rolls", () => {
    expect(planRoll("62 / 100", "63 / 100", 5)).toBeNull();
    expect(planRoll("62 / 100", "67 / 100", 5)).toBeNull();
    const [up] = runs(planRoll("62 / 100", "68 / 100", 5));
    expect(up).toMatchObject({ text: "68", dir: "up" });
    // " · 38 to go" falls as the count climbs: the two roll together.
    const [down] = runs(planRoll(" · 38 to go", " · 28 to go", 5));
    expect(down).toMatchObject({ text: "28", dir: "down" });
  });

  it("a threshold of 0 rolls every change, a cent included; nothing changed rolls nothing", () => {
    const [cent] = runs(planRoll("cost $12.34.", "cost $12.35."));
    expect(cent.cells.filter((c) => c.from !== null)).toEqual([{ char: "5", from: "4" }]);
    expect(planRoll("est. $148 of your $150", "est. $148 of your $150")).toBeNull();
    // The same value written another way is not a change.
    expect(planRoll("$150", "$150.00")).toBeNull();
  });

  it("rolls in settle-250's slot", () => {
    expect(ROLL_MS).toBe(250);
  });
});
