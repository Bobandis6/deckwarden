import { describe, expect, it } from "vitest";

import { alsoNeedsLine, comboDoorHref, comboPin, deckComboStatus, orderDeckCombos } from "./view";

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

describe("comboPin — the sheet's pinned context (X3)", () => {
  it("names every piece in name order, keeps every id (the commander too) and the templates", () => {
    const pin = comboPin(
      [
        { id: "z", name: "Zealous Conscripts" },
        { id: "k", name: "Kiki-Jiki, Mirror Breaker" },
      ],
      ["A sacrifice outlet"],
    );
    expect(pin).toEqual({
      label: "Kiki-Jiki, Mirror Breaker + Zealous Conscripts",
      pieceIds: ["k", "z"],
      templates: ["A sacrifice outlet"],
    });
  });

  it("does not mutate its inputs", () => {
    const pieces = [
      { id: "b", name: "B" },
      { id: "a", name: "A" },
    ];
    const templates = ["T"];
    const pin = comboPin(pieces, templates);
    expect(pieces.map((p) => p.id)).toEqual(["b", "a"]);
    pin.templates.push("U");
    expect(templates).toEqual(["T"]);
  });
});

describe("comboDoorHref — the hub door's draft link (X3)", () => {
  it("is the ?leader= seam plus the combo key and the autofill latch", () => {
    expect(comboDoorHref("mtg", "a34b7416-cfe3-4a1e-a8c1-a3056b747519", "618-1537")).toBe(
      "/decks/new?game=mtg&leader=a34b7416-cfe3-4a1e-a8c1-a3056b747519&combo=618-1537&autofill=1",
    );
    expect(comboDoorHref("mtg", "k", "4153-4247--5--195")).toBe(
      "/decks/new?game=mtg&leader=k&combo=4153-4247--5--195&autofill=1",
    );
  });
});
