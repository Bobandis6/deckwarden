/**
 * The deck pane's legality line (Y4a, WAVE4 D5): the bracket line renders
 * directly after the ValidationPanel — the Warden's line when approved, the
 * progress and problem lines otherwise — and before the leader zone; with
 * no `bracket` the pane renders as before.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { toEditorCard, type EditorEntry } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { ValidationIssue } from "@/lib/games/types";

import { DeckListPane } from "./deck-list-pane";

const mtg = getAdapter("mtg");
const kozilek = toEditorCard({
  ...card({ name: "Kozilek, the Great Distortion", isLeaderCandidate: true }),
  image: null,
});
const entries: EditorEntry[] = [{ cardId: kozilek.id, zone: "commander", qty: 1, tags: [] }];
const cards = new Map([[kozilek.id, kozilek]]);

function pane(issues: ValidationIssue[], bracket?: React.ReactNode) {
  return render(
    <DeckListPane
      adapter={mtg}
      format={COMMANDER}
      entries={entries}
      cards={cards}
      issues={issues}
      analytics={[]}
      onSetQty={() => undefined}
      onRemove={() => {}}
      onPreview={() => {}}
      bracket={bracket}
      extras={false}
    />,
  );
}

const slot = <p data-testid="bracket">At least Bracket 3 (Upgraded) · Why?</p>;

beforeEach(() => {
  window.localStorage.clear();
});

describe("DeckListPane — the bracket line's place", () => {
  it("approved: directly after the Warden's line", () => {
    pane([], slot);
    const warden = screen.getByRole("status");
    expect(warden.textContent).toContain("The Warden approves this deck");
    expect(warden.nextElementSibling).toBe(screen.getByTestId("bracket"));
  });

  it("not yet legal: directly after the progress and problem lines, before the leader zone", () => {
    const { container } = pane(
      [
        { code: "DECK_SIZE", severity: "error", message: "99 cards to go.", progress: true },
        { code: "BANNED", severity: "error", message: "1 card(s) are banned in Commander." },
      ],
      slot,
    );
    const validation = container.querySelector("[data-slot=progress-line]")!.parentElement!;
    expect(validation.textContent).toContain("1 problem");
    expect(validation.nextElementSibling).toBe(screen.getByTestId("bracket"));
    const zone = screen.getAllByText("Kozilek, the Great Distortion")[0];
    expect(
      screen.getByTestId("bracket").compareDocumentPosition(zone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("no bracket, no line: the Warden's line is followed by what followed it before", () => {
    pane([]);
    expect(screen.queryByTestId("bracket")).toBeNull();
    expect(screen.getByRole("status").nextElementSibling?.getAttribute("data-testid")).not.toBe(
      "bracket",
    );
  });
});
