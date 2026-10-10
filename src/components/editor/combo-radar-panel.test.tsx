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
    ...over,
  };
  render(<ComboRadarPanel {...props} />);
  return { onAdd };
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

  it("Add N pieces = ONE resolve call by externalKey + one add per missing piece + ONE toast", async () => {
    const { onAdd } = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Add 2 pieces" }));
    await act(async () => {});
    expect(resolvePosts()).toHaveLength(1);
    const body = JSON.parse(resolvePosts()[0][1].body as string) as { names: string[] };
    expect(body.names).toEqual([pestermite.externalKey, exarch.externalKey]);
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(vi.mocked(toast.add)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.add).mock.calls[0][0]).toMatchObject({
      title: "Added 2 combo pieces",
      type: "success",
    });
  });

  it("Suggest full list adds the pieces quietly and opens the sheet with the combo PINNED — no toast", async () => {
    const onOpenAutofill = vi.fn();
    const { onAdd } = renderPanel({ onOpenAutofill });
    const button = await screen.findByRole("button", { name: "Suggest full list" });
    expect(button.getAttribute("title")).toBe(
      "Keeps these pieces and suggests the rest of the deck",
    );
    fireEvent.click(button);
    await act(async () => {});
    expect(resolvePosts()).toHaveLength(1);
    expect(onAdd).toHaveBeenCalledTimes(2);
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
    const { onAdd } = renderPanel({
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
    expect(onOpenAutofill).toHaveBeenCalledWith({
      label: "Dramatic Reversal + Isochron Scepter",
      pieceIds: [reversal.id, scepter.id],
      templates: ["Nonland mana rocks producing 3+ mana"],
    });
  });

  it("One card away: adds the missing piece first (ONE resolve by externalKey), then opens the pinned sheet", async () => {
    fetchMock.mockImplementation(deckRoute);
    const onOpenAutofill = vi.fn();
    const { onAdd } = renderPanel({ deckId: DECK, onOpenAutofill });
    await screen.findByRole("heading", { name: "One card away" });
    const buttons = screen.getAllByRole("button", { name: "Suggest full list" });
    expect(buttons).toHaveLength(2); // In your deck + One card away (no commander combos here)
    fireEvent.click(buttons[1]);
    await act(async () => {});
    expect(resolvePosts()).toHaveLength(1);
    const body = JSON.parse(resolvePosts()[0][1].body as string) as { names: string[] };
    expect(body.names).toEqual([pestermite.externalKey]);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: pestermite.id }));
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
