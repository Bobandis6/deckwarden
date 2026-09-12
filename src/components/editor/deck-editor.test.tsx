/**
 * DeckEditor in draft mode across the tiers (R4 "done when", REDESIGN.md §5
 * and §7): on a phone the editor opens on Deck; "Add cards" switches to
 * Search and focuses the box; typing previews SILENTLY into the Card panel
 * (no sheet); a row tap opens the card sheet, Escape closes it; tab changes
 * keep the search input's element and value; a tier flip (phone → wide,
 * through matchMedia's change event) keeps the query, the results and the
 * preview and remounts only the tools; and NONE of it — tab changes, the
 * sheet, the md drawer, an appearance change, the flip — calls
 * `POST /api/decks` or leaves the save slot anything but "Saved". The
 * first Enter creates exactly ONE deck, swaps the URL in place, and the
 * autosave PUTs the list once.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardWire } from "@/lib/decks/editor-state";
import { card } from "@/lib/games/mtg/test-fixtures";
import { saveAppearance } from "@/lib/theme/appearance";
import { MD_QUERY, WIDE_QUERY } from "./use-tier";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import { DeckEditor } from "./deck-editor";

const sol: CardWire = {
  ...card({
    name: "Sol Ring",
    primaryType: "Artifact",
    costValue: 1,
    attrs: { type_line: "Artifact", oracle_text: "", mana_cost: "{1}" },
  }),
  image: "https://cards.scryfall.io/normal/front/8/3/83f43730-1c1f-4150-8771-d901c54bedc4.jpg",
};
const signet: CardWire = {
  ...card({
    name: "Arcane Signet",
    primaryType: "Artifact",
    costValue: 2,
    attrs: { type_line: "Artifact", oracle_text: "", mana_cost: "{2}" },
  }),
  image: null,
};

type Listener = () => void;
function stubViewport(width: number) {
  const listeners: { query: string; fn: Listener }[] = [];
  let current = width;
  const matches = (query: string) =>
    query === WIDE_QUERY ? current >= 1200 : query === MD_QUERY ? current >= 768 : false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return matches(query);
      },
      media: query,
      addEventListener: (_: "change", fn: Listener) => {
        listeners.push({ query, fn });
      },
      removeEventListener: (_: "change", fn: Listener) => {
        const i = listeners.findIndex((l) => l.query === query && l.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      addListener() {},
      removeListener() {},
    })),
  );
  return {
    resize(next: number) {
      current = next;
      for (const { fn } of [...listeners]) fn();
    },
  };
}

const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** The API surface the draft touches: search, the create, the card PUT, the panels. */
function route(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = init?.method ?? "GET";
  if (url.startsWith("/api/cards/search")) return ok({ results: [sol, signet] });
  if (url === "/api/decks" && method === "POST") {
    return ok({
      deck: { id: "deck-1", publicId: "abcdefgh1234", visibility: "unlisted" },
      claimToken: "token-1",
    });
  }
  if (url === "/api/decks/deck-1/cards" && method === "PUT") return ok({});
  if (url === "/api/decks/deck-1" && method === "PATCH") return ok({});
  if (url.startsWith("/api/decks/deck-1/recommendations")) return ok({ recommendations: [] });
  if (url.startsWith("/api/decks/deck-1/combos")) return ok({ combos: [], inDeck: [] });
  return ok({});
}

const posts = () =>
  fetchMock.mock.calls.filter(([url, init]) => url === "/api/decks" && init?.method === "POST")
    .length;
const puts = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT")
    .length;
const saveStatus = () =>
  document.querySelector("[data-slot=save-slot]")?.getAttribute("data-status");
const sheetPopup = () => document.querySelector("[data-slot=drawer-popup]");
const section = (label: string) =>
  document.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!;

/** Run the 200 ms search debounce and let the mocked fetch settle. */
async function settle(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  // Only the two the debounces need: RTL's findBy* and Base UI's frames stay real.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockReset();
  fetchMock.mockImplementation(route);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.localStorage.clear();
  window.history.replaceState(null, "", "/decks/new?game=mtg");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("DeckEditor (draft) across the tiers", () => {
  it("phone → Add cards → silent preview → sheet on tap → tab changes → wide: zero deck creates until the first Enter, then exactly one", async () => {
    const viewport = stubViewport(375);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);

    // Opens on Deck, nothing created, nothing dirty.
    expect(screen.getByRole("tab", { name: /^Deck/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("[data-tier]")?.getAttribute("data-tier")).toBe("phone");
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");

    // Add cards (the summary row's, phone-only) → Search active, the box focused.
    fireEvent.click(screen.getAllByRole("button", { name: "Add cards" })[0]);
    expect(screen.getByRole("tab", { name: "Search" }).getAttribute("aria-selected")).toBe("true");
    const input = screen.getByRole("combobox", { name: "Card search" });
    expect(document.activeElement).toBe(input);

    // Typing previews into the Card panel silently — no sheet.
    fireEvent.change(input, { target: { value: "sol" } });
    await settle();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    const tools = section("Card detail and suggestions");
    expect(within(tools).getByRole("heading", { name: "Sol Ring" })).toBeTruthy();
    expect(sheetPopup()).toBeNull();
    expect(document.activeElement).toBe(input);

    // A row tap is an explicit inspection: the sheet opens with the card; Escape closes it.
    fireEvent.click(screen.getByRole("option", { name: /Arcane Signet/ }));
    await act(async () => {});
    const sheet = screen.getByRole("dialog", { name: "Arcane Signet" });
    // Two headings by design: the sr-only DrawerTitle and the pane's own name.
    expect(within(sheet).getAllByRole("heading", { name: "Arcane Signet" })).toHaveLength(2);
    expect(within(sheet).getByRole("link", { name: /Card page/ })).toBeTruthy();
    fireEvent.keyDown(sheet, { key: "Escape" });
    await act(async () => {});
    expect(sheetPopup()).toBeNull();

    // Tab changes keep the pane mounted, the query, the results.
    fireEvent.click(screen.getByRole("tab", { name: /^Deck/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    expect(screen.getByRole("combobox", { name: "Card search" })).toBe(input);
    expect((input as HTMLInputElement).value).toBe("sol");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");

    // An appearance change is the reader's, not the deck's.
    act(() => saveAppearance({ backgroundArt: false }));
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");

    // The tier flip: phone → wide through matchMedia's change event (a live
    // resize, no reload). The input element, its value, the results and the
    // preview survive; the tools mount inline; still nothing created.
    act(() => viewport.resize(1440));
    expect(document.querySelector("[data-tier]")?.getAttribute("data-tier")).toBe("wide");
    expect(screen.getByRole("combobox", { name: "Card search" })).toBe(input);
    expect((input as HTMLInputElement).value).toBe("sol");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(
      within(section("Card detail and suggestions")).getByRole("heading", {
        name: "Arcane Signet",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Suggestions" })).toBeTruthy();
    expect(sheetPopup()).toBeNull();
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");

    // The first real edit: Enter adds the selected row; the debounce fires
    // ONE create, then the PUT; the URL swaps in place; the box keeps focus.
    // The row tap left Arcane Signet (index 1) selected; ArrowDown wraps to Sol Ring.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-0");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(saveStatus()).toBe("dirty");
    expect(within(section("Deck list")).getByText("Sol Ring")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Deck/ }).textContent).toBe("Deck · 1");
    expect(document.activeElement).toBe(input);
    expect(posts()).toBe(0);
    await settle(1100);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    expect(saveStatus()).toBe("saved");
    expect(window.location.pathname).toBe("/decks/deck-1/edit");
    expect(window.localStorage.getItem("deckwarden:deck-token:deck-1")).toBe("token-1");

    // And afterwards: a flip back to the phone, more tab changes, a sheet —
    // still that one create.
    act(() => viewport.resize(375));
    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    fireEvent.click(screen.getByRole("tab", { name: /^Deck/ }));
    fireEvent.click(within(section("Deck list")).getByRole("button", { name: "Sol Ring" }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Sol Ring" })).toBeTruthy();
    await settle(1100);
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    expect(saveStatus()).toBe("saved");
  });

  it("md: the Tools button and an explicit inspection open the drawer; opening it creates nothing", async () => {
    stubViewport(1024);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    expect(document.querySelector("[data-tier]")?.getAttribute("data-tier")).toBe("md");
    expect(section("Card detail and suggestions").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    await act(async () => {});
    const drawer = screen.getByRole("dialog", { name: "Tools" });
    expect(within(drawer).getByRole("tab", { name: "Card" })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close tools" }));
    await act(async () => {});
    expect(screen.queryByRole("dialog", { name: "Tools" })).toBeNull();
    // A search-row click reopens it on the Card tab with that card.
    const input = screen.getByRole("combobox", { name: "Card search" });
    fireEvent.change(input, { target: { value: "sol" } });
    await settle();
    expect(screen.queryByRole("dialog", { name: "Tools" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Arcane Signet/ }));
    await act(async () => {});
    const reopened = screen.getByRole("dialog", { name: "Tools" });
    expect(within(reopened).getByRole("heading", { name: "Arcane Signet" })).toBeTruthy();
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");
  });
});

describe("DeckEditor (a loaded deck) — openCuts by tier", () => {
  /** A 101-card Commander deck: the over-limit action shows, and no leader means no panel fetches. */
  function overLimitDeck() {
    const cards = Array.from({ length: 101 }, (_, i) => {
      const wire: CardWire = {
        ...card({ name: `Filler ${i + 1}`, primaryType: "Artifact", costValue: 2 }),
        image: null,
      };
      return { cardId: wire.id, zone: "main", qty: 1, tags: [], printingId: null, card: wire };
    });
    return {
      deck: {
        id: "deck-9",
        publicId: "zzzzzzzz9999",
        game: "mtg",
        format: "commander",
        name: "Over",
        description: null,
        notes: null,
        visibility: "unlisted",
        isOwner: true,
        forkedFrom: null,
        leaderIds: [],
      },
      cards,
      owned: [],
      hasCollection: false,
    };
  }

  async function renderLoaded(width: number) {
    const viewport = stubViewport(width);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/decks/deck-9" && (init?.method ?? "GET") === "GET") {
        return ok(overLimitDeck());
      }
      return route(input, init);
    });
    render(<DeckEditor deckId="deck-9" />);
    await act(async () => {});
    await act(async () => {});
    return viewport;
  }

  it("phone: 'Over by 1 — rank cuts' switches to the Tools pane on the Cuts tab, no sheet, no create", async () => {
    await renderLoaded(375);
    fireEvent.click(screen.getByRole("button", { name: "Over by 1 — rank cuts" }));
    expect(screen.getByRole("tab", { name: "Tools" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Cuts" }).getAttribute("aria-selected")).toBe("true");
    expect(sheetPopup()).toBeNull();
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");
  });

  it("md: it opens the tools drawer on the Cuts tab", async () => {
    await renderLoaded(1024);
    expect(screen.queryByRole("dialog", { name: "Tools" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Over by 1 — rank cuts" }));
    await act(async () => {});
    const drawer = screen.getByRole("dialog", { name: "Tools" });
    expect(within(drawer).getByRole("tab", { name: "Cuts" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(posts()).toBe(0);
  });

  it("wide: it flips the inline tab and opens nothing", async () => {
    await renderLoaded(1440);
    fireEvent.click(screen.getByRole("button", { name: "Over by 1 — rank cuts" }));
    expect(screen.getByRole("tab", { name: "Cuts" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(posts()).toBe(0);
  });
});
