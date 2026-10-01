/**
 * The /decks/new picker (P4.2) with Y2b's start doors (WAVE4 D2): each game
 * card carries the doors its adapter declares, in one order — Magic all
 * four, One Piece Pick a leader and Paste a list — and `?import=1` is a
 * one-shot latch like `?surprise=1`: the draft opens with the Import dialog
 * (the editor's `draftImport`, pinned in deck-editor.test.tsx), the param
 * leaves the URL and `?game=` stays, and a latch set on the picker itself
 * carries into the game picked next. The editor and the site shell are
 * stand-ins here.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/editor/deck-editor", () => ({
  DeckEditor: (props: { draftGame?: string; draftImport?: boolean; draftSurprise?: boolean }) => (
    <div
      data-testid="editor"
      data-game={props.draftGame}
      data-import={String(props.draftImport ?? false)}
      data-surprise={String(props.draftSurprise ?? false)}
    />
  ),
}));

const { NewDeckChooser } = await import("./new-deck-chooser");

const doors = (label: string) =>
  within(screen.getByRole("list", { name: label }))
    .getAllByRole("link")
    .map((a) => `${a.textContent} → ${a.getAttribute("href")}`);

beforeEach(() => window.history.replaceState(null, "", "/decks/new"));
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("NewDeckChooser — the picker's start doors (Y2b)", () => {
  it("each game card carries its adapter's doors, in one order", () => {
    render(<NewDeckChooser />);
    expect(screen.getByText("Pick your game.")).toBeTruthy();
    expect(doors("Other ways to start a Magic: The Gathering deck")).toEqual([
      "Pick a commander → /commanders",
      "Paste a list → /decks/new?game=mtg&import=1",
      "Start from a precon → /precons",
      "Surprise me → /decks/new?game=mtg&surprise=1",
    ]);
    expect(doors("Other ways to start a One Piece Card Game deck")).toEqual([
      "Pick a leader → /leaders",
      "Paste a list → /decks/new?game=optcg&import=1",
    ]);
  });

  it("?game=mtg&import=1 opens the draft with the Import latch; the param leaves the URL, ?game= stays", () => {
    window.history.replaceState(null, "", "/decks/new?game=mtg&import=1");
    render(<NewDeckChooser />);
    const editor = screen.getByTestId("editor");
    expect(editor.dataset.game).toBe("mtg");
    expect(editor.dataset.import).toBe("true");
    expect(window.location.search).toBe("?game=mtg");
  });

  it("a latch set on the picker carries into the game picked next — and a reload of what's left opens nothing", () => {
    window.history.replaceState(null, "", "/decks/new?import=1");
    const view = render(<NewDeckChooser />);
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(window.location.search).toBe("");

    // The picker's card is a same-route link: no remount, the latch holds.
    window.history.replaceState(null, "", "/decks/new?game=optcg");
    view.rerender(<NewDeckChooser />);
    expect(screen.getByTestId("editor").dataset.import).toBe("true");
    view.unmount();

    render(<NewDeckChooser />);
    expect(screen.getByTestId("editor").dataset.import).toBe("false");
  });
});
