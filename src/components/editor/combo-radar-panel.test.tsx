/**
 * The Combo Radar's "With your commander" section (W9c): fed by
 * GET /api/cards/[id]/combos?fit= so it renders in a seeded DRAFT with no
 * deck row; "in deck" marks and the missing count are client-side over
 * inDeckQty; "Add N pieces" hydrates every missing piece in ONE resolve
 * call (by externalKey) and lands ONE toast; "Build around" adds quietly
 * and opens the autofill sheet; without the door callback (the adapter
 * gate) no Build around renders. The deck-relative sections (P3.3) are
 * proven by their own smokes and the editor suite — here they just show
 * their honest draft placeholder.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(screen.getByText("Showing the 1 most-played of 7.")).toBeTruthy();
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

  it("Build around adds the pieces quietly and opens the sheet — no toast", async () => {
    const onOpenAutofill = vi.fn();
    const { onAdd } = renderPanel({ onOpenAutofill });
    fireEvent.click(await screen.findByRole("button", { name: "Build around" }));
    await act(async () => {});
    expect(resolvePosts()).toHaveLength(1);
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onOpenAutofill).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.add)).not.toHaveBeenCalled();
  });

  it("without the door callback (adapter gate) no Build around renders", async () => {
    renderPanel();
    await screen.findByRole("heading", { name: "With your commander" });
    expect(screen.queryByRole("button", { name: "Build around" })).toBeNull();
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
