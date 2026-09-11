/**
 * The Warden approves (R3, F1): the zero-issue line is a status region with
 * the build-plan wording, the settle plays only on the false→true transition
 * — not on a mount at zero (the share page), not on unrelated re-renders —
 * and it plays again after issues return and clear once more.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorCard } from "@/lib/decks/editor-state";
import { card } from "@/lib/games/mtg/test-fixtures";
import type { ValidationIssue } from "@/lib/games/types";
import { ValidationPanel } from "./validation-panel";

const DECK_SIZE: ValidationIssue = {
  code: "DECK_SIZE",
  severity: "error",
  message: "Commander decks are exactly 100 cards (has 0).",
};

function panel(issues: ValidationIssue[]) {
  return (
    <ValidationPanel
      formatLabel="Commander"
      issues={issues}
      cards={new Map()}
      onPreview={() => {}}
    />
  );
}

describe("ValidationPanel — the Warden line", () => {
  it("mounting at zero issues shows the line statically (no settle)", () => {
    render(panel([]));
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("The Warden approves this deck ✓");
    expect(status.getAttribute("title")).toBe("Legal Commander deck");
    expect(status.hasAttribute("data-settled")).toBe(false);
    expect(status.innerHTML).not.toContain("animate-in");
  });

  it("an empty deck shows the DECK_SIZE problem, never the line", () => {
    render(panel([DECK_SIZE]));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /1 problem/ })).toBeTruthy();
  });

  it("settles once on the false→true transition and not on the next unrelated render", () => {
    const { rerender } = render(panel([DECK_SIZE]));
    rerender(panel([]));
    const status = screen.getByRole("status");
    expect(status.hasAttribute("data-settled")).toBe(true);
    expect(status.innerHTML).toContain("motion-safe:animate-in");
    expect(status.innerHTML).toContain("motion-safe:duration-300");
    const mark = status.querySelector("svg");
    // An unrelated re-render (a name edit, a theme switch) keeps the same
    // nodes — nothing remounts, so nothing replays.
    rerender(panel([]));
    expect(screen.getByRole("status")).toBe(status);
    expect(status.querySelector("svg")).toBe(mark);
  });

  it("plays again after issues return and clear", () => {
    const { rerender } = render(panel([DECK_SIZE]));
    rerender(panel([]));
    const first = screen.getByRole("status").querySelector("svg");
    rerender(panel([DECK_SIZE]));
    expect(screen.queryByRole("status")).toBeNull();
    rerender(panel([]));
    const second = screen.getByRole("status").querySelector("svg");
    expect(second).not.toBe(first);
    expect(screen.getByRole("status").hasAttribute("data-settled")).toBe(true);
  });
});

describe("ValidationPanel — F5 previews (share pages)", () => {
  it("with `preview`, an issue's card chips are hover-card triggers that still call onPreview on click", () => {
    const sol: EditorCard = {
      ...card({ name: "Sol Ring", primaryType: "Artifact", costValue: 1 }),
      image: "https://cards.scryfall.io/normal/s.jpg",
    };
    const onPreview = vi.fn();
    render(
      <ValidationPanel
        formatLabel="Commander"
        issues={[
          {
            code: "COPY_LIMIT",
            severity: "error",
            message: "Too many copies of a card.",
            cardIds: [sol.id],
          },
        ]}
        cards={new Map([[sol.id, sol]])}
        onPreview={onPreview}
        preview
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /1 problem/ }));
    const chip = screen.getByRole("button", { name: "Sol Ring" });
    expect(chip.dataset.slot).toBe("hover-card-trigger");
    fireEvent.click(chip);
    expect(onPreview).toHaveBeenCalledWith(sol);
  });
});
