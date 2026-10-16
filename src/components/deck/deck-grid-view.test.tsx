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

describe("DeckGridView — the group heading (U3a)", () => {
  it("the text view's heading — label and count on space, sticky when asked; the share page's the same, unstuck (U6)", () => {
    const { container, unmount } = render(
      <DeckGridView groups={groups} severity={new Map()} onPreview={() => {}} stickyHeaders />,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.className).toContain("pt-5 pb-1.5");
    expect(heading.className).toContain("sticky top-0");
    expect(heading.querySelector("[data-slot=group-count]")?.textContent).toBe("3");
    expect(container.querySelector("section")?.className ?? "").not.toContain("mt-4");
    unmount();
    const share = render(
      <DeckGridView groups={groups} severity={new Map()} onPreview={() => {}} />,
    );
    const shared = screen.getByRole("heading", { level: 3 });
    expect(shared.className).toContain("pt-5 pb-1.5");
    expect(shared.className).not.toContain("border-b");
    expect(shared.className).not.toContain("sticky");
    expect(share.container.querySelector("section")?.hasAttribute("class")).toBe(false);
  });
});
