/**
 * The autofill review sheet (W9b, D8): one POST per open with the editor's
 * leaders + keeps, skeleton → groups → rows with evidence and the REQUIRED
 * source credit, live counts over the checkboxes (one row per pick entry —
 * a filler renders once as "Wastes × 11"), notes verbatim, validate issues
 * above the footer, Apply's list semantics (keep checked = on top of the
 * current list; unchecked = leaders + picks REPLACE the rest), reroll and
 * control changes re-POST without ever sending a seed, and the 429
 * sentence with its disabled Retry. The no-leader open fires nothing.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardWire, EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { toEditorCard } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { atraxa, card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import { AutofillSheet, type AutofillApply } from "./autofill-sheet";

const mtg = getAdapter("mtg");

const tower: CardWire = {
  ...card({ name: "Command Tower", primaryType: "Land", costValue: null, cheapestUsd: 0.23 }),
  image: "https://cards.scryfall.io/normal/front/0/0/tower.jpg",
};
const wastes: CardWire = {
  ...card({ name: "Wastes", primaryType: "Land", costValue: null, cheapestUsd: 0.1 }),
  image: null,
};
const signet: CardWire = {
  ...card({ name: "Arcane Signet", primaryType: "Artifact", costValue: 2, cheapestUsd: 0.43 }),
  image: null,
};
const leaderWire: CardWire = { ...atraxa, image: null };

/** The W9a response shape, small: 1 locked land + an 11× filler + 1 sampled two-drop. */
const shell = {
  game: "mtg",
  format: "commander",
  seed: 42,
  picks: [
    {
      cardId: tower.id,
      name: "Command Tower",
      zone: "main",
      qty: 1,
      group: "base",
      tier: "locked",
      score: 0.9,
      cheapestUsd: "0.23",
      evidence: [
        {
          source: "topdeck-top16",
          why: "Played in 62% of top-16 lists with Atraxa",
          with: [],
          howOften: "62% of 100 lists",
          confidence: "high",
        },
        {
          source: "edhrec_rank",
          why: "A Commander staple by EDHREC play data",
          with: [],
          howOften: null,
          confidence: "medium",
        },
      ],
    },
    {
      cardId: wastes.id,
      name: "Wastes",
      zone: "main",
      qty: 11,
      group: "base",
      tier: "filler",
      score: 0,
      cheapestUsd: "0.10",
      evidence: [
        {
          source: "land-template",
          why: "Fills the land template",
          with: [],
          howOften: null,
          confidence: "medium",
        },
      ],
    },
    {
      cardId: signet.id,
      name: "Arcane Signet",
      zone: "main",
      qty: 1,
      group: "curve-2",
      tier: "sampled",
      score: 0.7,
      cheapestUsd: "0.43",
      evidence: [
        {
          source: "edhrec_rank",
          why: "A Commander staple by EDHREC play data",
          with: [],
          howOften: null,
          confidence: "medium",
        },
      ],
    },
  ],
  groups: [
    { id: "base", label: "Lands", picks: 12 },
    { id: "curve-2", label: "Mana value 2", picks: 1 },
  ],
  notes: ["Filled 13 of 99 — too few candidates in Mana value 5."],
  totals: { picks: 13, estUsd: 1.76, unpriced: 0 },
  issues: [{ code: "DECK_SIZE", severity: "warning", message: "Deck has 14 of 100 cards." }],
  cards: [leaderWire, tower, wastes, signet],
};

const fetchMock = vi.fn();
const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => body,
});

const leaderEntry: EditorEntry = { cardId: atraxa.id, zone: "commander", qty: 1, tags: [] };
const keptEntry: EditorEntry = { cardId: signet.id, zone: "main", qty: 1, tags: ["ramp"] };
const cardsMap = new Map<string, EditorCard>([
  [atraxa.id, toEditorCard(leaderWire)],
  [signet.id, toEditorCard({ ...signet })],
]);

function sheet(over: Partial<React.ComponentProps<typeof AutofillSheet>> = {}) {
  return (
    <AutofillSheet
      adapter={mtg}
      format={COMMANDER}
      entries={[leaderEntry]}
      cards={cardsMap}
      phone={false}
      onApply={() => {}}
      onClose={() => {}}
      {...over}
    />
  );
}

const bodies = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url) === "/api/decks/autofill")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => ok(shell));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AutofillSheet", () => {
  it("no leader → the sentence, and NO POST is spent", () => {
    render(sheet({ entries: [] }));
    expect(screen.getByText(/Set a commander first/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("one POST on open (leaders + keeps, no seed), skeleton first, then groups, rows, notes verbatim, issues and the live Apply count", async () => {
    render(sheet({ entries: [leaderEntry, keptEntry] }));
    // Skeleton while the POST is in flight.
    expect(screen.getByLabelText("Building the shell…")).toBeTruthy();

    expect(await screen.findByText("Lands · 12")).toBeTruthy();
    expect(screen.getByText("Mana value 2 · 1")).toBeTruthy();
    const [body] = bodies();
    expect(body).toEqual({
      game: "mtg",
      format: "commander",
      leaderIds: [atraxa.id],
      keep: [{ cardId: signet.id, zone: "main", qty: 1 }],
    });
    expect("seed" in body).toBe(false);

    // One row per pick entry: the filler rides its quantity (D8 pin).
    expect(screen.getByRole("link", { name: "Wastes × 11" })).toBeTruthy();
    // Note + issue verbatim; evidence sentence with the REQUIRED source credit.
    expect(screen.getByText("Filled 13 of 99 — too few candidates in Mana value 5.")).toBeTruthy();
    expect(screen.getByText("Deck has 14 of 100 cards.")).toBeTruthy();
    const credit = screen.getByRole("link", { name: "Topdeck.gg" });
    expect(credit.getAttribute("href")).toBe("https://topdeck.gg");
    expect(screen.getByText(/Est\. total \$2/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add 13 cards" })).toBeTruthy();
  });

  it("unchecking rows updates the count; the group checkbox clears its rows; '+1 more' expands the evidence", async () => {
    render(sheet());
    await screen.findByText("Lands · 12");

    fireEvent.click(screen.getByRole("checkbox", { name: "Include Wastes × 11" }));
    expect(screen.getByRole("button", { name: "Add 2 cards" })).toBeTruthy();
    expect(screen.getByText("Lands · 1")).toBeTruthy();

    // Indeterminate group checkbox: first click checks all, the next clears all.
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Lands" }));
    expect(screen.getByRole("button", { name: "Add 13 cards" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Lands" }));
    expect(screen.getByRole("button", { name: "Add 1 card" })).toBeTruthy();

    // Collapsed, the staple sentence shows once (Signet's own top evidence);
    // expanding Command Tower's "+1 more" reveals its second entry too.
    expect(screen.getAllByText(/A Commander staple by EDHREC play data/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "+1 more" }));
    expect(screen.getAllByText(/A Commander staple by EDHREC play data/)).toHaveLength(2);
  });

  it("Apply with keep CHECKED hands back the current list plus the checked picks", async () => {
    const onApply = vi.fn();
    render(sheet({ entries: [leaderEntry, keptEntry], onApply }));
    await screen.findByText("Lands · 12");
    fireEvent.click(screen.getByRole("button", { name: "Add 13 cards" }));
    const apply = onApply.mock.calls[0][0] as AutofillApply;
    expect(apply.added).toBe(13);
    expect(apply.entries.slice(0, 2)).toEqual([leaderEntry, keptEntry]);
    expect(apply.entries).toHaveLength(5);
    expect(apply.cards.map((c) => c.name)).toContain("Command Tower");
  });

  it("keep UNCHECKED re-POSTs with keep: [] and Apply REPLACES the non-leader list (pinned)", async () => {
    const onApply = vi.fn();
    render(sheet({ entries: [leaderEntry, keptEntry], onApply }));
    await screen.findByText("Lands · 12");

    fireEvent.click(screen.getByRole("checkbox", { name: "Keep my 1 card" }));
    await screen.findByText("Lands · 12");
    expect(bodies().at(-1)?.keep).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Add 13 cards" }));
    const apply = onApply.mock.calls[0][0] as AutofillApply;
    // Leaders + picks only — the kept main-deck card is replaced by the plan.
    expect(apply.entries[0]).toEqual(leaderEntry);
    expect(apply.entries).toHaveLength(4);
  });

  it("budget chips re-POST with budgetUsd (absent / 5 / 1) and still no seed; Reroll re-POSTs the same body", async () => {
    render(sheet());
    await screen.findByText("Lands · 12");

    fireEvent.click(screen.getByRole("button", { name: "≤ $1 a card" }));
    await screen.findByText("Lands · 12");
    let last = bodies().at(-1)!;
    expect(last.budgetUsd).toBe(1);
    expect("seed" in last).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reroll" }));
    await screen.findByText("Lands · 12");
    last = bodies().at(-1)!;
    expect(bodies()).toHaveLength(3);
    expect(last.budgetUsd).toBe(1);
    expect("seed" in last).toBe(false);
  });

  it("a 429 renders its sentence with Retry disabled for the advertised window — never an auto-retry", async () => {
    fetchMock.mockImplementation(() => ({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "7" }),
      json: async () => ({ error: "rate limited" }),
    }));
    render(sheet());
    expect(
      await screen.findByText("Too many autofill requests — try again in 7 seconds."),
    ).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toHaveProperty("disabled", true);
    expect(bodies()).toHaveLength(1);
  });

  it("a failed POST renders the sentence + an enabled Retry that re-POSTs", async () => {
    fetchMock.mockImplementationOnce(() => ({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({}),
    }));
    render(sheet());
    expect(await screen.findByText(/Couldn't build the shell/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Lands · 12")).toBeTruthy();
    expect(bodies()).toHaveLength(2);
  });

  it("phone renders the full-height Drawer with the same content", async () => {
    render(sheet({ phone: true }));
    expect(await screen.findByText("Lands · 12")).toBeTruthy();
    const popup = document.querySelector("[data-slot=drawer-popup]")!;
    expect(within(popup as HTMLElement).getByText("Autofill a starter shell")).toBeTruthy();
  });
});
