/**
 * CardDetailPane as the phone card sheet's body (U4b, WAVE5 D5): a header
 * row at every point (the name, the type line and the cost, the frame's
 * Close at its end); the actions at the peek, each only where the editor
 * hands one over; the card from the half; the text, the tags, the footer
 * line (44 px links on touch) and Printings at the full point. Without
 * `sheet` the pane keeps its own layout, image first.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorCard } from "@/lib/decks/editor-state";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";

import { CardDetailPane, type CardSheet, type SheetActions } from "./card-detail-pane";

const adapter = getAdapter("mtg");
const sol: EditorCard = {
  ...card({
    name: "Sol Ring",
    primaryType: "Artifact",
    costValue: 1,
    attrs: { type_line: "Artifact", oracle_text: "{T}: Add {C}{C}.", mana_cost: "{1}" },
  }),
  image: "https://cards.scryfall.io/normal/front/8/3/83f43730-1c1f-4150-8771-d901c54bedc4.jpg",
};

function sheetAt(point: CardSheet["point"], actions: SheetActions = {}): CardSheet {
  return {
    point,
    close: (
      <button type="button" aria-label="Close">
        ×
      </button>
    ),
    actions,
  };
}

const tagging = { tags: [], onSetTags: vi.fn() };

describe("CardDetailPane as the phone card sheet (U4b)", () => {
  it("the peek: the name, the type line with the cost, Close, and the actions it is given; no card yet", () => {
    const onRemove = vi.fn();
    const onSwap = vi.fn();
    render(
      <CardDetailPane
        adapter={adapter}
        card={sol}
        tagging={tagging}
        sheet={sheetAt("peek", { onRemove, onSwap })}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Sol Ring" })).toBeTruthy();
    expect(screen.getByText("Artifact")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Swap…" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledTimes(1);
    // No Add was handed over (a card the deck holds), and nothing past the actions.
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("{T}: Add {C}{C}.")).toBeNull();
    expect(screen.queryByRole("link", { name: /Card page/ })).toBeNull();
    // 44 px on touch.
    expect(screen.getByRole("button", { name: "Remove" }).className).toContain(
      "pointer-coarse:h-11",
    );
  });

  it("the half adds the card, sized to fit under the header and the actions; Add carries the editor's label", () => {
    const onClick = vi.fn();
    render(
      <CardDetailPane
        adapter={adapter}
        card={sol}
        sheet={sheetAt("half", { add: { label: "Swap in…", onClick } })}
      />,
    );
    const image = screen.getByRole("img", { name: "Sol Ring" });
    expect(image.className).toContain("w-[min(60%,calc((55dvh-7.75rem)*0.7176))]");
    fireEvent.click(screen.getByRole("button", { name: "Swap in…" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("{T}: Add {C}{C}.")).toBeNull();
    expect(screen.queryByRole("button", { name: /Printings/ })).toBeNull();
  });

  it("the full point adds the text, the tags, the footer line with 44 px links on touch, and Printings", () => {
    render(
      <CardDetailPane adapter={adapter} card={sol} tagging={tagging} sheet={sheetAt("full")} />,
    );
    expect(screen.getByText("{T}: Add {C}{C}.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tags in this deck" })).toBeTruthy();
    const cardPage = screen.getByRole("link", { name: /Card page/ });
    expect(cardPage.className).toContain("pointer-coarse:min-h-11");
    expect(screen.getByRole("button", { name: /Printings/ })).toBeTruthy();
    // The column scrolls under the header row, which keeps the name and Close.
    const column = document.querySelector("[data-slot=sheet-column]")!;
    expect(column.className).toContain("overflow-y-auto");
    expect(column.contains(screen.getByRole("heading", { level: 2, name: "Sol Ring" }))).toBe(
      false,
    );
    expect(column.contains(screen.getByRole("button", { name: "Close" }))).toBe(false);
  });

  it("with no card it keeps the frame's Close beside the hint", () => {
    render(<CardDetailPane adapter={adapter} card={null} sheet={sheetAt("half")} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByText("Search or click a card to see it here.")).toBeTruthy();
  });
});

describe("CardDetailPane without a sheet", () => {
  it("keeps its own layout: the image first, the name and cost under it, the footer's text links", () => {
    const { container } = render(<CardDetailPane adapter={adapter} card={sol} tagging={tagging} />);
    const root = container.firstElementChild!;
    expect(root.className).toBe("p-3");
    expect(root.firstElementChild?.tagName).toBe("IMG");
    expect(screen.getByRole("heading", { level: 2, name: "Sol Ring" })).toBeTruthy();
    expect(screen.getByText("{T}: Add {C}{C}.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Card page/ }).className).toBe("hover:underline");
    expect(document.querySelector("[data-slot=sheet-actions]")).toBeNull();
  });
});
