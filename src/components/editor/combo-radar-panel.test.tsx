/**
 * The Combo Radar's "With your commander" section (W9c): fed by
 * GET /api/cards/[id]/combos?fit= so it renders in a seeded DRAFT with no
 * deck row; "in deck" marks and the missing count are client-side over
 * inDeckQty; "Add N pieces" hydrates every missing piece in ONE resolve
 * call (by externalKey) and lands ONE toast. "Suggest full list" (X3 —
 * W9c's "Build around", renamed) adds quietly and opens the autofill sheet
 * with the combo PINNED, on all three kinds of row: "With your commander",
 * "In your deck" (a saved deck's detection) and "One card away" (which adds
 * its missing piece first); without the door callback (the adapter gate)
 * no row renders it. The deck-relative rows need a deck id, a saved state
 * and the /api/decks/<id>/combos answer.
 *
 * Y6b: the adds are the editor's to announce — "Add N pieces" hands every
 * piece over in ONE batch (announced: one toast, one Undo — pinned in
 * deck-editor.test.tsx), "Suggest full list" hands them over quietly, the
 * single Add says nothing on the live line. The deck-relative rows carry a
 * badge each — the adapter's words, credited, "above your target" when it
 * is — and never change which rows show.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeckComboView } from "@/lib/combos/queries";
import type { EditorCard } from "@/lib/decks/editor-state";
import { getAdapter } from "@/lib/games/registry";
import { card } from "@/lib/games/mtg/test-fixtures";

vi.mock("@/components/ui/toast", () => ({
  toast: { add: vi.fn(), close: vi.fn() },
}));

import { toast } from "@/components/ui/toast";
import { ComboRadarPanel } from "./combo-radar-panel";

const adapter = getAdapter("mtg");
const format = adapter.formats[0];

const commander = card({
  name: "Kiki-Jiki, Mirror Breaker",
  isLeaderCandidate: true,
  ciMask: 8,
  externalKey: "11111111-1111-4111-8111-111111111111",
});
const pestermite = card({
  name: "Pestermite",
  ciMask: 2,
  externalKey: "22222222-2222-4222-8222-222222222222",
});
const exarch = card({
  name: "Deceiver Exarch",
  ciMask: 2,
  externalKey: "33333333-3333-4333-8333-333333333333",
});

const toEditor = (c: ReturnType<typeof card>): EditorCard => ({ ...c, image: null });

const comboResponse = {
  total: 7,
  combos: [
    {
      id: 101,
      externalKey: "spellbook-101",
      results: ["Infinite hasty tokens"],
      templates: [],
      popularity: 4200,
      pieces: [
        { id: commander.id, name: commander.name, externalKey: commander.externalKey },
        { id: pestermite.id, name: pestermite.name, externalKey: pestermite.externalKey },
        { id: exarch.id, name: exarch.name, externalKey: exarch.externalKey },
      ],
    },
  ],
};

const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const resolvePosts = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url) === "/api/cards/resolve" && (init as RequestInit | undefined)?.method === "POST",
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(toast.add).mockReset();
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith(`/api/cards/${commander.id}/combos`)) return ok(comboResponse);
    if (url === "/api/cards/resolve") {
      return ok({
        results: [{ match: { ...pestermite, image: null } }, { match: { ...exarch, image: null } }],
      });
    }
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(over: Partial<Parameters<typeof ComboRadarPanel>[0]> = {}) {
  const onAdd = vi.fn(() => undefined);
  const onAddPieces = vi.fn<
    (cards: readonly EditorCard[], announce: boolean) => string | undefined
  >(() => undefined);
  const props = {
    adapter,
    format,
    deckId: null,
    entries: [{ cardId: commander.id, zone: "commander", qty: 1 }],
    cards: new Map([[commander.id, toEditor(commander)]]),
    inDeckQty: new Map([[commander.id, 1]]),
    saveStatus: "saved" as const,
    active: true,
    onAdd,
    onAddPieces,
    ...over,
  };
  const view = render(<ComboRadarPanel {...props} />);
  return { onAdd, onAddPieces: props.onAddPieces as typeof onAddPieces, view };
}

describe("ComboRadarPanel — With your commander (W9c)", () => {
  it("renders the commander's combos in a DRAFT (no deck row) with in-deck ✓s, the honest count line, and the fit mask on the wire", async () => {
    renderPanel();
    expect(await screen.findByRole("heading", { name: "With your commander" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pestermite" })).toBeTruthy();
    // Only the commander is in deck: its piece is marked, two are missing.
    expect(screen.getByLabelText("Kiki-Jiki, Mirror Breaker is in the deck")).toBeTruthy();
    expect(screen.queryByLabelText("Pestermite is in the deck")).toBeNull();
    expect(screen.getByRole("button", { name: "Add 2 pieces" })).toBeTruthy();
    expect(screen.getByText("Showing the 1 most popular of 7.")).toBeTruthy();
    const comboFetch = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith(`/api/cards/${commander.id}/combos`),
    );
    expect(String(comboFetch?.[0])).toBe(`/api/cards/${commander.id}/combos?fit=8`);
    // The draft placeholder for the deck-relative half stays honest.
    expect(screen.getByText("Combos appear once the deck saves.")).toBeTruthy();
  });

  it("Add N pieces = ONE resolve call by externalKey + ONE announced batch — the editor's toast, none of the panel's", async () => {
    const { onAdd, onAddPieces } = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Add 2 pieces" }));
    await act(async () => {});
    expect(resolvePosts()).toHaveLength(1);
    const body = JSON.parse(resolvePosts()[0][1].body as string) as { names: string[] };
    expect(body.names).toEqual([pestermite.externalKey, exarch.externalKey]);
    expect(onAddPieces).toHaveBeenCalledTimes(1);
    expect(onAddPieces).toHaveBeenCalledWith(
      [expect.objectContaining({ id: pestermite.id }), expect.objectContaining({ id: exarch.id })],
      true,
    );
    expect(onAdd).not.toHaveBeenCalled();
    expect(vi.mocked(toast.add)).not.toHaveBeenCalled();
  });

  it("a batch the editor refuses toasts its error", async () => {
    const { onAddPieces } = renderPanel({ onAddPieces: vi.fn(() => "Main deck is full") });
    fireEvent.click(await screen.findByRole("button", { name: "Add 2 pieces" }));
    await act(async () => {});
    expect(onAddPieces).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.add)).toHaveBeenCalledWith({
      title: "Main deck is full",
      type: "error",
    });
  });

  it("Suggest full list adds the pieces quietly and opens the sheet with the combo PINNED — no toast", async () => {
    const onOpenAutofill = vi.fn();
    const { onAdd, onAddPieces } = renderPanel({ onOpenAutofill });
    const button = await screen.findByRole("button", { name: "Suggest full list" });
    expect(button.getAttribute("title")).toBe(
      "Keeps these pieces and suggests the rest of the deck",
    );
    fireEvent.click(button);
    await act(async () => {});
    expect(resolvePosts()).toHaveLength(1);
    expect(onAddPieces).toHaveBeenCalledTimes(1);
    expect(onAddPieces.mock.calls[0][1]).toBe(false);
    expect(onAdd).not.toHaveBeenCalled();
    expect(onOpenAutofill).toHaveBeenCalledTimes(1);
    // Every piece, the commander included (the sheet drops leader-zone ids), name order.
    expect(onOpenAutofill).toHaveBeenCalledWith({
      label: "Deceiver Exarch + Kiki-Jiki, Mirror Breaker + Pestermite",
      pieceIds: [exarch.id, commander.id, pestermite.id],
      templates: [],
    });
    expect(vi.mocked(toast.add)).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Build around" })).toBeNull();
  });

  it("without the door callback (adapter gate) no Suggest full list renders", async () => {
    renderPanel();
    await screen.findByRole("heading", { name: "With your commander" });
    expect(screen.queryByRole("button", { name: "Suggest full list" })).toBeNull();
  });

  it("every piece already in deck: no Add button, 'All pieces in deck ✓'", async () => {
    renderPanel({
      inDeckQty: new Map([
        [commander.id, 1],
        [pestermite.id, 1],
        [exarch.id, 1],
      ]),
    });
    expect(await screen.findByText("All pieces in deck ✓")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add \d+ piece/ })).toBeNull();
  });
});

describe("ComboRadarPanel — Suggest full list on the deck's own rows (X3)", () => {
  const DECK = "deck-1";
  const ref = (c: ReturnType<typeof card>) => ({
    id: c.id,
    name: c.name,
    externalKey: c.externalKey,
  });
  const reversal = card({ name: "Dramatic Reversal", ciMask: 2, externalKey: "oracle-reversal" });
  const scepter = card({ name: "Isochron Scepter", ciMask: 0, externalKey: "oracle-scepter" });
  const inDeck: DeckComboView = {
    id: 201,
    externalKey: "1-2",
    results: ["Infinite mana"],
    templates: ["Nonland mana rocks producing 3+ mana"],
    popularity: 900,
    tag: "E",
    relevant: true,
    inDeckPieces: [ref(reversal), ref(scepter)],
    missingPieces: [],
  };
  const oneAway: DeckComboView = {
    id: 202,
    externalKey: "3-4",
    results: ["Infinite hasty tokens"],
    templates: [],
    popularity: 700,
    tag: "R",
    relevant: true,
    inDeckPieces: [ref(commander)],
    missingPieces: [ref(pestermite)],
  };

  function deckRoute(input: RequestInfo | URL) {
    const url = String(input);
    if (url === `/api/decks/${DECK}/combos`) {
      return ok({ inDeck: [inDeck], oneAway: [oneAway], truncated: false });
    }
    if (url.startsWith(`/api/cards/${commander.id}/combos`)) return ok({ total: 0, combos: [] });
    if (url === "/api/cards/resolve") {
      return ok({ results: [{ match: { ...pestermite, image: null } }] });
    }
    return ok({});
  }

  it("In your deck: every piece is held — opens the pinned sheet at once, no resolve", async () => {
    fetchMock.mockImplementation(deckRoute);
    const onOpenAutofill = vi.fn();
    const { onAdd, onAddPieces } = renderPanel({
      deckId: DECK,
      onOpenAutofill,
      inDeckQty: new Map([
        [commander.id, 1],
        [reversal.id, 1],
        [scepter.id, 1],
      ]),
    });
    await screen.findByRole("heading", { name: "In your deck" });
    const [inDeckButton] = screen.getAllByRole("button", { name: "Suggest full list" });
    fireEvent.click(inDeckButton);
    await act(async () => {});
    expect(resolvePosts()).toHaveLength(0);
    expect(onAdd).not.toHaveBeenCalled();
    expect(onAddPieces).not.toHaveBeenCalled();
    expect(onOpenAutofill).toHaveBeenCalledWith({
      label: "Dramatic Reversal + Isochron Scepter",
      pieceIds: [reversal.id, scepter.id],
      templates: ["Nonland mana rocks producing 3+ mana"],
    });
  });

  it("One card away: adds the missing piece first (ONE resolve by externalKey), then opens the pinned sheet", async () => {
    fetchMock.mockImplementation(deckRoute);
    const onOpenAutofill = vi.fn();
    const { onAdd, onAddPieces } = renderPanel({ deckId: DECK, onOpenAutofill });
    await screen.findByRole("heading", { name: "One card away" });
    const buttons = screen.getAllByRole("button", { name: "Suggest full list" });
    expect(buttons).toHaveLength(2); // In your deck + One card away (no commander combos here)
    fireEvent.click(buttons[1]);
    await act(async () => {});
    expect(resolvePosts()).toHaveLength(1);
    const body = JSON.parse(resolvePosts()[0][1].body as string) as { names: string[] };
    expect(body.names).toEqual([pestermite.externalKey]);
    expect(onAddPieces).toHaveBeenCalledTimes(1);
    expect(onAddPieces).toHaveBeenCalledWith(
      [expect.objectContaining({ id: pestermite.id })],
      false,
    );
    expect(onAdd).not.toHaveBeenCalled();
    expect(onOpenAutofill).toHaveBeenCalledWith({
      label: "Kiki-Jiki, Mirror Breaker + Pestermite",
      pieceIds: [commander.id, pestermite.id],
      templates: [],
    });
    // The plain Add stays beside it, unchanged.
    expect(screen.getByRole("button", { name: "Add Pestermite to the deck" })).toBeTruthy();
  });

  it("without the door callback, the deck's own rows carry no Suggest full list either", async () => {
    fetchMock.mockImplementation(deckRoute);
    renderPanel({ deckId: DECK });
    await screen.findByRole("heading", { name: "One card away" });
    expect(screen.queryByRole("button", { name: "Suggest full list" })).toBeNull();
  });
});

describe("ComboRadarPanel — badges (Y6b)", () => {
  const DECK = "deck-2";
  const ref = (c: ReturnType<typeof card>) => ({
    id: c.id,
    name: c.name,
    externalKey: c.externalKey,
  });
  const [rock, wand, loop, spare, extra] = ["Rock", "Wand", "Loop", "Spare", "Extra"].map((name) =>
    card({ name, externalKey: `oracle-${name.toLowerCase()}` }),
  );
  const view = (
    id: number,
    held: ReturnType<typeof card>[],
    missing: ReturnType<typeof card>[],
    over: Partial<DeckComboView> = {},
  ): DeckComboView => ({
    id,
    externalKey: `k-${id}`,
    results: ["Infinite mana"],
    templates: [],
    popularity: 100 * id,
    tag: "E",
    relevant: false,
    inDeckPieces: held.map(ref),
    missingPieces: missing.map(ref),
    ...over,
  });
  const ruthless = view(1, [rock, wand, loop], [], { tag: "R" });
  const quiet = view(2, [spare, wand, loop], []);
  const spicy = view(3, [rock, wand], [extra], { tag: "S" });
  const withCommander = view(4, [commander], [pestermite], { tag: "R", relevant: true });

  function badgeRoute(input: RequestInfo | URL) {
    const url = String(input);
    if (url === `/api/decks/${DECK}/combos`) {
      return ok({
        inDeck: [ruthless, quiet],
        oneAway: [spicy, withCommander],
        truncated: false,
      });
    }
    if (url.startsWith(`/api/cards/${commander.id}/combos`)) return ok(comboResponse);
    return ok({});
  }
  const badges = () =>
    [...document.querySelectorAll<HTMLElement>("[data-slot=combo-badge]")].map(
      (b) => b.textContent,
    );
  const rowsText = () =>
    [...document.querySelectorAll("li")].map(
      (li) => li.querySelector("p, span")?.textContent ?? "",
    );

  beforeEach(() => {
    fetchMock.mockImplementation(badgeRoute);
  });

  it("each deck-relative row says what its combo alone makes a deck, credited; one that raises nothing says nothing", async () => {
    renderPanel({ deckId: DECK });
    await screen.findByRole("heading", { name: "One card away" });
    expect(badges()).toEqual([
      "This combo alone makes a deck at least Bracket 4 — Commander Spellbook",
      "This combo alone makes a deck Bracket 3 or 4 — your call — Commander Spellbook",
      "A two-card combo with your commander alone makes a deck at least Bracket 4 — Commander Spellbook",
    ]);
    // No target: nothing is "above" anything.
    expect(document.querySelector("[data-above-target]")).toBeNull();
    // The commander's own rows (the card route's public combos) carry none.
    const leaderSection = screen
      .getByRole("heading", { name: "With your commander" })
      .closest("section")!;
    expect(leaderSection.querySelector("[data-slot=combo-badge]")).toBeNull();
  });

  it("a target names the rows above it — a call above it counts — and never changes which rows show", async () => {
    const { view: plain } = renderPanel({ deckId: DECK });
    await screen.findByRole("heading", { name: "One card away" });
    const without = rowsText();
    plain.unmount();

    renderPanel({ deckId: DECK, goals: { v: 1, targetLevel: 3 } });
    await screen.findByRole("heading", { name: "One card away" });
    expect(rowsText()).toEqual(without);
    expect(badges()).toEqual([
      "This combo alone makes a deck at least Bracket 4 — Commander Spellbook · above your target",
      "This combo alone makes a deck Bracket 3 or 4 — your call — Commander Spellbook · above your target",
      "A two-card combo with your commander alone makes a deck at least Bracket 4 — Commander Spellbook · above your target",
    ]);
    expect(document.querySelectorAll("[data-above-target]")).toHaveLength(3);
  });

  it("at a target of 4 nothing is above it; an answered call counts as answered", async () => {
    renderPanel({
      deckId: DECK,
      goals: { v: 1, targetLevel: 4, answers: { rulesetVersion: 1, calls: { "combo:k-3": "no" } } },
    });
    await screen.findByRole("heading", { name: "One card away" });
    expect(document.querySelector("[data-above-target]")).toBeNull();
    expect(badges()[1]).toBe(
      "This combo alone makes a deck at least Bracket 3 — Commander Spellbook",
    );
  });

  it("a game without brackets shows no badge", async () => {
    renderPanel({ deckId: DECK, adapter: { ...adapter, brackets: undefined } });
    await screen.findByRole("heading", { name: "One card away" });
    expect(badges()).toEqual([]);
  });

  it("One card away's Add: the editor announces it — the live line stays quiet", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === "/api/cards/resolve") {
        return ok({ results: [{ match: { ...extra, image: null } }] });
      }
      return badgeRoute(input);
    });
    const { onAdd } = renderPanel({ deckId: DECK });
    fireEvent.click(await screen.findByRole("button", { name: "Add Extra to the deck" }));
    await act(async () => {});
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: extra.id }));
    expect(screen.queryByText("Added Extra")).toBeNull();
  });
});
