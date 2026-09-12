/**
 * SampleHand (R6, F4): the deal's stagger (per-slot delay under the 400 ms
 * budget, motion-safe classes, no delay under reduced motion), the Keep /
 * Mulligan prompt as a state machine (none → dealt → kept), Keep freezing
 * the hand and announcing it, Mulligan redrawing and counting, New hand
 * restarting, and every deal replaying through the list's key.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { atraxa, card } from "@/lib/games/mtg/test-fixtures";
import { DEAL_CARD_MOTION_CLASS, DEAL_CARD_MS, DEAL_STAGGER_MS, SampleHand } from "./sample-hand";

const commanderZone = COMMANDER.zones.find((z) => z.isLeaderZone)!.id;
const mainZone = COMMANDER.zones.find((z) => !z.isLeaderZone)!.id;

const island = card({ name: "Island", primaryType: "Land", costValue: 0 });
const cards = new Map<string, EditorCard>([
  [atraxa.id, { ...atraxa, image: null }],
  [island.id, { ...island, image: null }],
]);
const entries: EditorEntry[] = [
  { cardId: atraxa.id, zone: commanderZone, qty: 1, tags: [] },
  { cardId: island.id, zone: mainZone, qty: 40, tags: [] },
];

const dealt = () => document.querySelector<HTMLElement>("[data-slot=dealt-hand]");
const slots = () => [...document.querySelectorAll<HTMLElement>("[data-slot=dealt-hand] > li")];
const status = () => document.querySelector<HTMLElement>("[data-slot=hand-status]")!;
const phase = () => document.querySelector<HTMLElement>("[data-phase]")!.dataset.phase;

function mount() {
  return render(<SampleHand entries={entries} cards={cards} format={COMMANDER} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SampleHand — the deal (F4)", () => {
  it("the whole seven-card deal ends under 400 ms", () => {
    expect((COMMANDER.openingHandSize - 1) * DEAL_STAGGER_MS + DEAL_CARD_MS).toBeLessThanOrEqual(
      400,
    );
    for (const token of DEAL_CARD_MOTION_CLASS.split(" ")) expect(token).toMatch(/^motion-safe:/);
    expect(DEAL_CARD_MOTION_CLASS).toContain("motion-safe:fill-mode-backwards");
  });

  it("deals seven with a climbing animation-delay per slot and replays on a new deal", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    mount();
    expect(dealt()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Draw sample hand" }));
    const first = dealt()!;
    expect(slots()).toHaveLength(7);
    slots().forEach((li, i) => {
      expect(li.className).toContain(DEAL_CARD_MOTION_CLASS);
      expect(li.style.animationDelay).toBe(`${i * DEAL_STAGGER_MS}ms`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Mulligan" }));
    // A fresh list element: the key changed, so the entrance plays again.
    expect(dealt()).not.toBe(first);
    expect(slots()[6].style.animationDelay).toBe(`${6 * DEAL_STAGGER_MS}ms`);
  });

  it("under reduced motion the cards simply appear — no delay written", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Draw sample hand" }));
    expect(slots()).toHaveLength(7);
    for (const li of slots()) expect(li.style.animationDelay).toBe("");
  });
});

describe("SampleHand — Keep / Mulligan (F4)", () => {
  it("none → dealt: the game prompt with Keep and Mulligan, no New hand, nothing announced yet", () => {
    mount();
    expect(phase()).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Draw sample hand" }));
    expect(phase()).toBe("dealt");
    expect(screen.getByRole("group", { name: "Keep this hand?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mulligan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New hand" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Draw sample hand" })).toBeNull();
    expect(status().getAttribute("aria-live")).toBe("polite");
    expect(status().textContent).toBe("");
  });

  it("Mulligan redraws seven and counts; Keep freezes the hand and says so; New hand restarts", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Draw sample hand" }));
    fireEvent.click(screen.getByRole("button", { name: "Mulligan" }));
    expect(status().textContent).toBe("After 1 mulligan");
    expect(slots()).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "Mulligan" }));
    expect(status().textContent).toBe("After 2 mulligans");

    const hand = dealt()!;
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(phase()).toBe("kept");
    expect(status().textContent).toBe("Hand kept after 2 mulligans.");
    expect(dealt()).toBe(hand); // frozen: the same list, no redeal
    expect(dealt()!.dataset.kept).toBe("true");
    expect(screen.queryByRole("button", { name: "Keep" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mulligan" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New hand" }));
    expect(phase()).toBe("dealt");
    expect(status().textContent).toBe("");
    expect(dealt()).not.toBe(hand);
    expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
  });

  it("keeping a first hand announces without a mulligan count", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Draw sample hand" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(status().textContent).toBe("Hand kept.");
  });

  it("a dealt card previews on click when a handler is given", () => {
    const preview = vi.fn();
    render(<SampleHand entries={entries} cards={cards} format={COMMANDER} onPreview={preview} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw sample hand" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Island" })[0]);
    expect(preview).toHaveBeenCalledWith(cards.get(island.id));
  });
});
