/**
 * DeckTextView (R3, C12 / C13 / C15 / F3): editor rows reveal steppers and
 * remove on hover or focus-within while the quantity stays visible, keep a
 * fixed pip column even for costless cards, carry the One Piece id and stat
 * suffix, and pop the one badge that grew; share rows have none of the
 * controls; headers stick only when asked.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { DeckGroup } from "@/lib/decks/view-model";
import { DeckTextView } from "./deck-text-view";

const mtg = getAdapter("mtg");
const optcg = getAdapter("optcg");

const sol: EditorCard = {
  ...card({
    name: "Sol Ring",
    primaryType: "Artifact",
    costValue: 1,
    attrs: { type_line: "Artifact", oracle_text: "", mana_cost: "{1}" },
  }),
  image: null,
};
const forest: EditorCard = {
  ...card({
    name: "Forest",
    primaryType: "Land",
    costValue: null,
    attrs: { type_line: "Basic Land — Forest", oracle_text: "", mana_cost: "" },
  }),
  image: null,
};
const nami: EditorCard = {
  id: "d2f0b1a4-0000-4000-8000-000000000001",
  name: "Nami",
  externalKey: "OP01-016",
  primaryType: "Character",
  costValue: 1,
  colorsMask: 1,
  ciMask: 1,
  isLeaderCandidate: false,
  isPreview: false,
  cheapestUsd: null,
  popularity: null,
  legality: [],
  attrs: { category: "character", power_num: 1000, counter_num: 1000 },
  image: null,
};

function group(items: { card: EditorCard; qty?: number }[]): DeckGroup<EditorEntry, EditorCard>[] {
  return [
    {
      key: "type:Test",
      label: "Test",
      qty: items.reduce((n, i) => n + (i.qty ?? 1), 0),
      items: items.map((i) => ({
        entry: { cardId: i.card.id, zone: "main", qty: i.qty ?? 1, tags: [] },
        card: i.card,
      })),
    },
  ];
}

describe("DeckTextView", () => {
  it("editor rows: visible quantity, reveal-on-hover steppers and remove, a pip column on every row", () => {
    render(
      <DeckTextView
        adapter={mtg}
        groups={group([{ card: sol, qty: 4 }, { card: forest }])}
        severity={new Map()}
        onSetQty={() => {}}
        onRemove={() => {}}
        onPreview={() => {}}
      />,
    );
    const fewer = screen.getByRole("button", { name: "One fewer Sol Ring" });
    expect(fewer.className).toContain("group-hover/row:opacity-100");
    expect(fewer.className).toContain("group-focus-within/row:opacity-100");
    expect(screen.getByRole("button", { name: "Remove Forest" }).className).toContain(
      "group-focus-within/row:opacity-100",
    );
    const qtys = document.querySelectorAll('[data-slot="qty"]');
    expect([...qtys].map((q) => q.textContent)).toEqual(["4", "1"]);
    expect([...qtys].every((q) => !q.className.includes("opacity-0"))).toBe(true);
    expect(document.querySelectorAll('[data-slot="pips"]')).toHaveLength(2);
  });

  it("share rows: no steppers, no remove, plain headers", () => {
    render(
      <DeckTextView
        adapter={mtg}
        groups={group([{ card: sol }])}
        severity={new Map()}
        onPreview={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /One fewer/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 3 }).className).not.toContain("sticky");
  });

  it("sticky headers only when asked (the editor's scrolling pane)", () => {
    render(
      <DeckTextView
        adapter={mtg}
        groups={group([{ card: sol }])}
        severity={new Map()}
        onPreview={() => {}}
        stickyHeaders
      />,
    );
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("sticky top-0");
  });

  it("One Piece rows carry the printed id and the mono Power · Counter suffix", () => {
    render(
      <DeckTextView
        adapter={optcg}
        groups={group([{ card: nami, qty: 4 }])}
        severity={new Map()}
        onPreview={() => {}}
      />,
    );
    expect(screen.getByText("OP01-016")).toBeTruthy();
    const stats = screen.getByText("1000 · +1000");
    expect(stats.className).toContain("font-mono");
    expect(document.querySelector(".don-cost")?.textContent).toBe("1");
  });

  it("the popped row's badge remounts with the animation class; other rows do not", () => {
    render(
      <DeckTextView
        adapter={mtg}
        groups={group([{ card: sol, qty: 5 }, { card: forest }])}
        severity={new Map()}
        onSetQty={() => {}}
        onPreview={() => {}}
        pop={{ key: `main:${sol.id}`, nonce: 1 }}
      />,
    );
    const [solQty, forestQty] = document.querySelectorAll('[data-slot="qty"]');
    expect(solQty.className).toContain("motion-safe:animate-in");
    expect(forestQty.className).not.toContain("animate-in");
  });
});
