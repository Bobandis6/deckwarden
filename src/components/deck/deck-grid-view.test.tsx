/**
 * DeckGridView (R6, status never color-only): a card's validation ring is
 * accompanied by sr-only severity text described onto the card button —
 * "Has a problem" / "Warning", the text view's words — while the button's
 * name stays "Show {name}"; a clean card has no description.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import type { DeckGroup } from "@/lib/decks/view-model";
import { DeckGridView } from "./deck-grid-view";

const mainZone = COMMANDER.zones.find((z) => !z.isLeaderZone)!.id;
const solRing: EditorCard = { ...card({ name: "Sol Ring", primaryType: "Artifact" }), image: null };
const bolt: EditorCard = {
  ...card({ name: "Lightning Bolt", primaryType: "Instant", costValue: 1 }),
  image: null,
};
const flash: EditorCard = { ...card({ name: "Flash", primaryType: "Instant" }), image: null };

function entry(c: EditorCard): EditorEntry {
  return { cardId: c.id, zone: mainZone, qty: 1, tags: [] };
}

const groups: DeckGroup<EditorEntry, EditorCard>[] = [
  {
    key: "all",
    label: "Cards",
    qty: 3,
    items: [solRing, bolt, flash].map((c) => ({ entry: entry(c), card: c })),
  },
];

describe("DeckGridView — severity as text", () => {
  it("describes problem and warning cards, leaves the clean one undescribed, keeps the names", () => {
    render(
      <DeckGridView
        groups={groups}
        severity={
          new Map([
            [bolt.id, "error" as const],
            [flash.id, "warning" as const],
          ])
        }
        onPreview={() => {}}
      />,
    );
    const clean = screen.getByRole("button", { name: "Show Sol Ring" });
    expect(clean.hasAttribute("aria-describedby")).toBe(false);
    expect(clean.className).not.toContain("ring-2");

    const problem = screen.getByRole("button", { name: "Show Lightning Bolt" });
    expect(problem.className).toContain("ring-destructive");
    expect(document.getElementById(problem.getAttribute("aria-describedby")!)!.textContent).toBe(
      "Has a problem",
    );

    const warning = screen.getByRole("button", { name: "Show Flash" });
    expect(warning.className).toContain("ring-amber-500");
    const desc = document.getElementById(warning.getAttribute("aria-describedby")!)!;
    expect(desc.textContent).toBe("Warning");
    expect(desc.className).toContain("sr-only");
    expect(document.querySelectorAll("[data-slot=severity]")).toHaveLength(2);
  });
});
