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

describe("DeckListPane — the bones (U3a, WAVE5 D4)", () => {
  function full(over: Partial<React.ComponentProps<typeof DeckListPane>> = {}) {
    return render(
      <DeckListPane
        adapter={mtg}
        format={COMMANDER}
        entries={entries}
        cards={cards}
        issues={[]}
        analytics={[]}
        onSetQty={() => undefined}
        onRemove={() => {}}
        onPreview={() => {}}
        {...over}
      />,
    );
  }

  it("the Warden line and the bracket line share one status slot, siblings in order", () => {
    full({ bracket: slot });
    const status = document.querySelector<HTMLElement>("[data-slot=status-slot]")!;
    expect(status.contains(screen.getByRole("status"))).toBe(true);
    expect(status.contains(screen.getByTestId("bracket"))).toBe(true);
    expect(screen.getByRole("status").nextElementSibling).toBe(screen.getByTestId("bracket"));
  });

  it("the first line holds the Warden line's 20 px: the progress line takes leading-5, its dot in the 16 px gutter", () => {
    full({
      entries: [],
      issues: [
        { code: "DECK_SIZE", severity: "error", message: "100 cards to go.", progress: true },
      ],
    });
    const line = document.querySelector<HTMLElement>("[data-slot=progress-line]")!;
    expect(line.className).toContain("leading-5");
    expect(line.firstElementChild?.className).toContain("size-4");
  });

  it("View / Group / Sort: View is the group's name, not a visible label; Group and Sort keep theirs", () => {
    window.localStorage.clear();
    full({
      entries: [...entries, { cardId: "extra", zone: "main", qty: 1, tags: [] }],
      cards: new Map([
        ...cards,
        [
          "extra",
          toEditorCard({
            ...card({ name: "Sol Ring", primaryType: "Artifact" }),
            id: "extra",
            image: null,
          }),
        ],
      ]),
    });
    expect(screen.getByRole("group", { name: "View" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Group" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Sort" })).toBeTruthy();
    expect(screen.queryByText("View")).toBeNull();
    expect(screen.getByText("Group")).toBeTruthy();
    expect(screen.getByText("Sort")).toBeTruthy();
  });

  it("the summary's right cluster never wraps from md; on a phone the row keeps the 44 px of Add cards", () => {
    full();
    const size = document.querySelector<HTMLElement>("[data-slot=deck-size]")!;
    expect(size.className).toContain("shrink-0");
    expect(size.className).toContain("whitespace-nowrap");
    expect(size.parentElement!.className).toContain("min-w-0");
    expect(size.parentElement!.className).toContain("md:flex-nowrap");
    const row = size.parentElement!.parentElement!;
    expect(row.className).toContain("max-md:pointer-coarse:min-h-11");
    expect((row.firstElementChild as HTMLElement).className).toContain("self-stretch");
  });

  it("while a seed lands the leader zone holds the card's box and the extras wait; then both are back", () => {
    const { rerender } = render(
      <DeckListPane
        adapter={mtg}
        format={COMMANDER}
        entries={[]}
        cards={new Map()}
        issues={[]}
        analytics={[]}
        onSetQty={() => undefined}
        onRemove={() => {}}
        onPreview={() => {}}
        onChooseLeader={() => {}}
        seeding
      />,
    );
    expect(document.querySelector("[data-slot=leader-pending]")).not.toBeNull();
    expect(screen.queryByText("No commander yet")).toBeNull();
    expect(screen.queryByText("Sample hand")).toBeNull();
    // The seed lands: the commander and one main-deck card (a library to draw from).
    const sol = toEditorCard({
      ...card({ name: "Sol Ring", primaryType: "Artifact" }),
      image: null,
    });
    rerender(
      <DeckListPane
        adapter={mtg}
        format={COMMANDER}
        entries={[...entries, { cardId: sol.id, zone: "main", qty: 1, tags: [] }]}
        cards={new Map([...cards, [sol.id, sol]])}
        issues={[]}
        analytics={[]}
        onSetQty={() => undefined}
        onRemove={() => {}}
        onPreview={() => {}}
        onChooseLeader={() => {}}
      />,
    );
    expect(document.querySelector("[data-slot=leader-pending]")).toBeNull();
    expect(screen.getAllByText("Kozilek, the Great Distortion").length).toBeGreaterThan(0);
    expect(screen.getByText("Sample hand")).toBeTruthy();
  });

  it("the leader image is the pane's LCP: priority", () => {
    full({
      cards: new Map([
        [kozilek.id, { ...kozilek, image: "https://cards.scryfall.io/normal/front/a/b/ab.jpg" }],
      ]),
    });
    const img = screen.getByRole("img", { name: "Kozilek, the Great Distortion" });
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });
});
