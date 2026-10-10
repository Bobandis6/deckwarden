/**
 * Y7b — "Swap in…"'s sheet on its own (WAVE4 D8): combo protection comes
 * from the bracket line's facts and says so whenever it can't protect; a
 * combo piece is never the named partner; a quantity says one copy comes
 * in; a swap's error stays as a line.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BracketFactsState } from "@/lib/brackets/facts";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { CompleteCombo } from "@/lib/games/types";
import { SwapInSheet } from "./swap-sheet";

const mtg = getAdapter("mtg");
const editorCard = (name: string, costValue: number | null, popularity: number | null) =>
  ({
    ...card({ name, primaryType: "Artifact", costValue, popularity }),
    image: null,
  }) as EditorCard;

const leader = { ...editorCard("Odric", 4, 900), isLeaderCandidate: true };
// The fringiest 2-drop completes a combo; the next one is an ordinary cut.
const comboTwo = editorCard("Combo Two", 2, 49_000);
const mate = editorCard("Combo Mate", 3, 900);
const fringeTwo = editorCard("Fringe Two", 2, 30_000);
const incoming = editorCard("Arcane Signet", 2, 10);
const CARDS = new Map([leader, comboTwo, mate, fringeTwo].map((c) => [c.id, c]));
const entry = (c: EditorCard, zone = "main"): EditorEntry => ({
  cardId: c.id,
  zone,
  qty: 1,
  tags: [],
});
const ENTRIES = [entry(leader, "commander"), entry(comboTwo), entry(mate), entry(fringeTwo)];
const COMBO: CompleteCombo = {
  key: "c1",
  cardPieces: [comboTwo.id, mate.id].sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite mana"],
  popularity: 400,
};

function renderSheet({
  entries = ENTRIES,
  combos = [COMBO] as CompleteCombo[] | null,
  factsState = "ready" as BracketFactsState,
  qty = 1,
  onSwap = vi.fn<(outId: string) => string | undefined>(),
} = {}) {
  render(
    <SwapInSheet
      adapter={mtg}
      format={COMMANDER}
      incoming={incoming}
      qty={qty}
      entries={entries}
      cards={CARDS}
      combos={combos}
      factsState={factsState}
      phone={false}
      onSwap={onSwap}
      onClose={() => {}}
    />,
  );
  return { sheet: screen.getByRole("dialog", { name: "Swap in Arcane Signet" }), onSwap };
}

describe("SwapInSheet", () => {
  it("the facts protect a combo piece: the next ordinary cut is named, the piece waits with its mark", () => {
    const { sheet } = renderSheet();
    expect(sheet.querySelector("[data-slot=swap-in-already]")).toBeNull();
    const partner = within(sheet).getByRole("region", { name: "Suggested cut" });
    expect(partner.textContent).toContain("Fringe Two");
    expect(sheet.textContent).not.toMatch(/protect/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Choose another card" }));
    const same = within(sheet).getByRole("region", { name: "Also at mana value 2" });
    expect(same.textContent).toContain("Combo Two");
    expect(within(same).getByText("in combo")).toBeTruthy();
  });

  it("without facts nothing is protected — and the sheet says so, in the Cut Coach's terms", () => {
    const checking = renderSheet({ combos: null, factsState: "checking" });
    expect(checking.sheet.textContent).toContain(
      "Checking combos — this suggestion doesn’t protect them yet.",
    );
    // The fringier combo piece is named: honest about what it couldn't see.
    expect(
      within(checking.sheet).getByRole("region", { name: "Suggested cut" }).textContent,
    ).toContain("Combo Two");
  });

  it("a failed check, or no commander, says so too", () => {
    renderSheet({ combos: null, factsState: "failed" });
    expect(screen.getByRole("dialog").textContent).toContain(
      "Couldn’t check combos — this suggestion doesn’t protect them.",
    );
  });

  it("no commander: combo warnings need one", () => {
    renderSheet({ entries: ENTRIES.slice(1), combos: null, factsState: "off" });
    expect(screen.getByRole("dialog").textContent).toContain(
      "Combo warnings need a Commander — this suggestion doesn’t protect combos yet.",
    );
  });

  it("“4 Arcane Signet” at the maximum: one copy comes in, and the sheet says so", () => {
    const { sheet } = renderSheet({ qty: 4 });
    expect(sheet.textContent).toContain(
      "Arcane Signet comes in and one card goes out — the deck stays at 100. One copy at a time while the deck is full.",
    );
  });

  it("a card already in the list comes in as another copy — and says so; it's never its own partner", () => {
    render(
      <SwapInSheet
        adapter={mtg}
        format={COMMANDER}
        incoming={fringeTwo}
        qty={1}
        entries={ENTRIES}
        cards={CARDS}
        combos={[COMBO]}
        factsState="ready"
        phone={false}
        onSwap={() => undefined}
        onClose={() => {}}
      />,
    );
    const sheet = screen.getByRole("dialog", { name: "Swap in Fringe Two" });
    expect(sheet.querySelector("[data-slot=swap-in-already]")?.textContent).toBe(
      "Fringe Two is already in the deck (×1) — this adds another copy.",
    );
    expect(
      within(sheet).queryByRole("button", { name: "Swap Fringe Two for Fringe Two" }),
    ).toBeNull();
  });

  it("a swap's error stays in the sheet as a line", () => {
    const onSwap = vi.fn<(outId: string) => string | undefined>(
      () => "That card isn't in the deck anymore",
    );
    const { sheet } = renderSheet({ onSwap });
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Swap Fringe Two for Arcane Signet" }),
    );
    expect(onSwap).toHaveBeenCalledWith(fringeTwo.id);
    expect(within(sheet).getByRole("alert").textContent).toBe(
      "That card isn't in the deck anymore",
    );
  });
});
