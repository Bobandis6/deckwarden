import { describe, expect, it } from "vitest";

import { alsoNeedsLine, deckComboStatus, orderDeckCombos } from "./view";

const combo = (missing: number, templates: string[] = []) => ({
  templates,
  missingPieces: new Array(missing).fill({}),
});

describe("deckComboStatus — the template rule, enforced", () => {
  it("all card pieces present, no templates → complete", () => {
    expect(deckComboStatus(combo(0))).toBe("complete");
  });

  it("a template combo is NEVER complete on cards alone", () => {
    expect(deckComboStatus(combo(0, ["A creature with power 5 or greater"]))).toBe(
      "needs-template",
    );
  });

  it("a missing card piece → one-away, with or without templates", () => {
    expect(deckComboStatus(combo(1))).toBe("one-away");
    expect(deckComboStatus(combo(1, ["A sacrifice outlet"]))).toBe("one-away");
  });
});

describe("alsoNeedsLine — the engine's phrasing, standalone", () => {
  it("names every open template requirement", () => {
    expect(alsoNeedsLine(["A sacrifice outlet", "A haste enabler"])).toBe(
      "Also needs A sacrifice outlet, A haste enabler",
    );
  });

  it("is null when cards are the whole story", () => {
    expect(alsoNeedsLine([])).toBeNull();
  });
});

describe("orderDeckCombos — complete first, stable within", () => {
  it("sorts complete before needs-template, preserving input (popularity) order within", () => {
    const a = { ...combo(0, ["T"]), id: "a" };
    const b = { ...combo(0), id: "b" };
    const c = { ...combo(0), id: "c" };
    expect(orderDeckCombos([a, b, c]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate its input", () => {
    const input = [combo(0, ["T"]), combo(0)];
    orderDeckCombos(input);
    expect(deckComboStatus(input[0])).toBe("needs-template");
  });
});
