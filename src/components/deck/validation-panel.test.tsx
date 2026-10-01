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

describe("ValidationPanel — progress, not problems (Y2a)", () => {
  const EMPTY_COMMANDER: ValidationIssue = {
    code: "ZONE_SIZE",
    severity: "error",
    message: "Commander must have 1–2 cards (has 0).",
    zone: "commander",
    progress: true,
  };
  const SHORT: ValidationIssue = { ...DECK_SIZE, progress: true };
  const BANNED: ValidationIssue = {
    code: "BANNED",
    severity: "error",
    message: "Mana Crypt is banned in Commander.",
  };

  it("with a progress line, flagged issues are one neutral line — no red count, never the approval", () => {
    render(
      <ValidationPanel
        formatLabel="Commander"
        issues={[EMPTY_COMMANDER, SHORT]}
        cards={new Map()}
        onPreview={() => {}}
        progress="Choose a commander · 100 to go"
      />,
    );
    const line = document.querySelector('[data-slot="progress-line"]') as HTMLElement;
    expect(line.textContent).toBe("Choose a commander · 100 to go");
    expect(line.className).toContain("text-muted-foreground");
    expect(screen.queryByRole("button", { name: /problem/ })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("real problems stay red beneath the line, counted without the progress", () => {
    render(
      <ValidationPanel
        formatLabel="Commander"
        issues={[SHORT, BANNED]}
        cards={new Map()}
        onPreview={() => {}}
        progress="2 to go"
      />,
    );
    expect(document.querySelector('[data-slot="progress-line"]')?.textContent).toBe("2 to go");
    const problems = screen.getByRole("button", { name: /^1 problem/ });
    expect(problems.className).toContain("text-destructive");
    fireEvent.click(problems);
    expect(screen.getByText("Mana Crypt is banned in Commander.")).toBeTruthy();
    expect(screen.queryByText(DECK_SIZE.message)).toBeNull();
  });

  it("without a line (the share page) a flagged issue is still a problem", () => {
    render(panel([SHORT]));
    expect(document.querySelector('[data-slot="progress-line"]')).toBeNull();
    expect(screen.getByRole("button", { name: /1 problem/ })).toBeTruthy();
  });
});

describe("ValidationPanel — the first approval's action (Y2b)", () => {
  const share = <button type="button">Share this deck</button>;

  it("sits under the Warden line, never inside it — the line stays legality-only", () => {
    const { container } = render(
      <ValidationPanel
        formatLabel="Commander"
        issues={[]}
        cards={new Map()}
        onPreview={() => {}}
        approvalAction={share}
      />,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("The Warden approves this deck ✓");
    expect(status.contains(screen.getByRole("button", { name: "Share this deck" }))).toBe(false);
    const action = container.querySelector('[data-slot="approval-action"]')!;
    expect(status.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("only while approved: with issues the action never renders", () => {
    render(
      <ValidationPanel
        formatLabel="Commander"
        issues={[DECK_SIZE]}
        cards={new Map()}
        onPreview={() => {}}
        approvalAction={share}
      />,
    );
    expect(screen.queryByRole("button", { name: "Share this deck" })).toBeNull();
  });

  it("without one (the share page) the approved markup is the same single line", () => {
    const { container } = render(panel([]));
    expect(container.firstElementChild?.tagName).toBe("P");
    expect(container.querySelector('[data-slot="approval-action"]')).toBeNull();
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
