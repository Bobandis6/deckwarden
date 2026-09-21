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

import { massEntryUrl } from "@/lib/buy/links";
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

/** W6: two slim printings rows for Sol Ring (W5's API shape), default first on the wire or not — the pane hoists it. */
const solDefaultPrinting = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  setCode: "cmm",
  setName: "Commander Masters",
  collectorNumber: "410",
  rarity: "uncommon",
  year: 2023,
  isDefault: true,
  hasBack: false,
  usd: "2.89",
  usdFoil: null,
};
const solAltPrinting = {
  id: "aaaaaaaa-0000-4000-8000-000000000002",
  setCode: "sld",
  setName: "Secret Lair Drop",
  collectorNumber: "2783",
  rarity: "rare",
  year: 2024,
  isDefault: false,
  hasBack: false,
  usd: null,
  usdFoil: "12.00",
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
  if (url === `/api/cards/${sol.id}/printings`) {
    // Newest first like the real route — the pane hoists the default itself.
    return ok({ printings: [solAltPrinting, solDefaultPrinting], total: 2, truncated: false });
  }
  if (url === `/api/cards/${signet.id}/printings`) {
    // The N=1 case: the pane stays honest with a single row.
    return ok({
      printings: [{ ...solDefaultPrinting, id: "aaaaaaaa-0000-4000-8000-000000000003" }],
      total: 1,
      truncated: false,
    });
  }
  return ok({});
}

const posts = () =>
  fetchMock.mock.calls.filter(([url, init]) => url === "/api/decks" && init?.method === "POST")
    .length;
const puts = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT")
    .length;
const printingsFetches = (cardId: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url) === `/api/cards/${cardId}/printings`).length;
const lastPutEntries = (): { cardId: string; printingId?: string }[] => {
  const putCalls = fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
  );
  const body = (putCalls.at(-1)?.[1] as RequestInit).body as string;
  return (JSON.parse(body) as { cards: { cardId: string; printingId?: string }[] }).cards;
};
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

describe("DeckEditor — a commander add returns the phone to the Deck pane (P2.8b)", () => {
  /** Draft editor with "sol" typed and both results on screen. */
  async function withResults(width: number) {
    stubViewport(width);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    if (width < 768) fireEvent.click(screen.getAllByRole("button", { name: "Add cards" })[0]);
    const input = screen.getByRole("combobox", { name: "Card search" });
    fireEvent.change(input, { target: { value: "sol" } });
    await settle();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  }

  it("phone: the row's Commander button adds and switches to the Deck pane — one create", async () => {
    await withResults(375);
    fireEvent.click(screen.getByRole("button", { name: "Add Sol Ring as Commander" }));
    expect(screen.getByRole("tab", { name: /^Deck/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Search" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: /^Deck/ }).textContent).toBe("Deck · 1");
    expect(screen.getByText("Added Sol Ring as Commander")).toBeTruthy();
    expect(sheetPopup()).toBeNull();
    await settle(1100);
    await act(async () => {});
    expect(posts()).toBe(1);
  });

  it("phone: a plain Add stays on Search so repeated adds keep working", async () => {
    await withResults(375);
    fireEvent.click(screen.getByRole("button", { name: "Add Sol Ring to Main deck" }));
    expect(screen.getByRole("tab", { name: "Search" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /^Deck/ }).getAttribute("aria-selected")).toBe("false");
    await settle(1100);
    await act(async () => {});
    expect(posts()).toBe(1);
  });

  it("md: a commander add opens no drawer — the deck is already on screen", async () => {
    await withResults(1024);
    fireEvent.click(screen.getByRole("button", { name: "Add Sol Ring as Commander" }));
    await act(async () => {});
    expect(screen.queryByRole("dialog", { name: "Tools" })).toBeNull();
    expect(within(section("Deck list")).getByText("Sol Ring")).toBeTruthy();
  });

  it("wide: a commander add changes nothing but the deck", async () => {
    await withResults(1440);
    fireEvent.click(screen.getByRole("button", { name: "Add Sol Ring as Commander" }));
    // The success toast is the one legitimate popup; no Tools drawer, no sheet.
    expect(screen.queryByRole("dialog", { name: "Tools" })).toBeNull();
    expect(sheetPopup()).toBeNull();
    expect(within(section("Deck list")).getByText("Sol Ring")).toBeTruthy();
  });
});

describe("DeckEditor — the pane's Printings collapsible (W6, D5)", () => {
  const tools = () => section("Card detail and suggestions");

  /** Wide draft with Sol Ring added (the one create), earlier toasts expired. */
  async function withSolInDeck() {
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    const input = screen.getByRole("combobox", { name: "Card search" });
    fireEvent.change(input, { target: { value: "sol" } });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Add Sol Ring to Main deck" }));
    // Flush the create + PUT and expire the add toast, so the only Undo
    // later on screen is the printing toast's.
    await settle(5500);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    return input;
  }

  it("fetches on FIRST open only; row clicks preview without editing; 'Use this printing' is a real autosaved edit with a real Undo", async () => {
    await withSolInDeck();

    // Closed by default, nothing fetched, no count yet.
    const trigger = within(tools()).getByRole("button", { name: /^Printings/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(printingsFetches(sol.id)).toBe(0);

    // First open → ONE request; rows render default-first; the count lands.
    fireEvent.click(trigger);
    await act(async () => {});
    expect(printingsFetches(sol.id)).toBe(1);
    expect(within(tools()).getByRole("button", { name: /Printings · 2/ })).toBeTruthy();
    const rows = within(tools()).getAllByRole("button", { pressed: false });
    const rowNames = rows.map((r) => r.textContent);
    expect(rowNames.some((t) => t?.includes("Commander Masters"))).toBe(true);
    // The default row is marked as what the deck uses (no explicit choice yet).
    expect(
      within(tools()).getByRole("button", { name: /Commander Masters/ }).textContent,
    ).toContain("In deck");
    expect(within(tools()).getByText(/In deck: default printing · CMM · #410/)).toBeTruthy();

    // Selecting a row previews it in the pane image — no edit, no save, and
    // the apply button arms only now (the selection differs from the deck).
    const useButton = () =>
      within(tools()).getByRole("button", { name: "Use this printing in deck" });
    expect(useButton()).toHaveProperty("disabled", true);
    fireEvent.click(within(tools()).getByRole("button", { name: /Secret Lair Drop/ }));
    const paneImage = within(tools()).getByRole("img", { name: "Sol Ring" });
    expect(paneImage.getAttribute("src")).toContain(solAltPrinting.id);
    expect(useButton()).toHaveProperty("disabled", false);
    await settle(1100);
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    expect(saveStatus()).toBe("saved");

    // Close and reopen → the per-card cache answers, no second request.
    fireEvent.click(within(tools()).getByRole("button", { name: /Printings · 2/ }));
    await act(async () => {});
    fireEvent.click(within(tools()).getByRole("button", { name: /Printings · 2/ }));
    await act(async () => {});
    expect(printingsFetches(sol.id)).toBe(1);

    // The real edit: dirty → autosave PUTs printingId; toast per D5.
    fireEvent.click(useButton());
    expect(saveStatus()).toBe("dirty");
    const choiceToast = screen
      .getByText("Sol Ring now uses SLD 2783")
      .closest('[data-slot="toast"]');
    expect(choiceToast).toBeTruthy();
    await settle(1100);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(2);
    expect(lastPutEntries()).toEqual([
      { cardId: sol.id, zone: "main", qty: 1, tags: [], printingId: solAltPrinting.id },
    ]);
    // The pane now marks the chosen row and disables the (unchanged) selection.
    expect(within(tools()).getByText(/In deck: SLD · #2783/)).toBeTruthy();
    expect(within(tools()).getByRole("button", { name: /Secret Lair Drop/ }).textContent).toContain(
      "In deck",
    );
    expect(useButton()).toHaveProperty("disabled", true);

    // Undo is a REAL edit: the previous (default) choice re-applies and the
    // next autosave PUTs a list without printingId — never a client rollback.
    fireEvent.click(within(choiceToast as HTMLElement).getByRole("button", { name: "Undo" }));
    expect(saveStatus()).toBe("dirty");
    await settle(1100);
    await act(async () => {});
    expect(puts()).toBe(3);
    expect(lastPutEntries()).toEqual([{ cardId: sol.id, zone: "main", qty: 1, tags: [] }]);
    expect(within(tools()).getByText(/In deck: default printing/)).toBeTruthy();
    expect(posts()).toBe(1);
  });

  it("a previewed card NOT in the deck browses printings honestly at N=1; switching cards and returning reuses the cache", async () => {
    const input = await withSolInDeck();

    // Open Sol Ring's printings once (the deck add left it previewed).
    fireEvent.click(within(tools()).getByRole("button", { name: /^Printings/ }));
    await act(async () => {});
    expect(printingsFetches(sol.id)).toBe(1);

    // Preview Arcane Signet without adding it. Its collapsible is closed
    // (the open state is per card), and opening it is viewer-only.
    fireEvent.change(input, { target: { value: "arcane" } });
    await settle();
    fireEvent.click(screen.getByRole("option", { name: /Arcane Signet/ }));
    await act(async () => {});
    expect(within(tools()).getByRole("heading", { name: "Arcane Signet" })).toBeTruthy();
    const signetTrigger = within(tools()).getByRole("button", { name: /^Printings/ });
    expect(signetTrigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(signetTrigger);
    await act(async () => {});
    expect(printingsFetches(signet.id)).toBe(1);
    expect(within(tools()).getByRole("button", { name: /Printings · 1/ })).toBeTruthy();
    // Viewer only: rows render, but no deck controls and nothing marked.
    expect(within(tools()).queryByText(/In deck/)).toBeNull();
    expect(within(tools()).queryByRole("button", { name: "Use this printing in deck" })).toBeNull();
    // Browsing minted nothing.
    await settle(1100);
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    expect(saveStatus()).toBe("saved");

    // Back on Sol Ring: closed again, and reopening hits the cache — the one
    // request from the top of the test stands (the verify list's item 2).
    fireEvent.change(input, { target: { value: "sol ring" } });
    await settle();
    fireEvent.click(screen.getByRole("option", { name: /Sol Ring/ }));
    await act(async () => {});
    fireEvent.click(within(tools()).getByRole("button", { name: /^Printings/ }));
    await act(async () => {});
    expect(within(tools()).getByText(/In deck: default printing/)).toBeTruthy();
    expect(printingsFetches(sol.id)).toBe(1);
  });
});

describe("DeckEditor — Buy this deck (W7, D6)", () => {
  /** Base UI menu triggers open on the pointer sequence, not a bare click. */
  function openMenu(trigger: HTMLElement) {
    fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(trigger, { button: 0 });
    fireEvent.click(trigger, { button: 0 });
  }

  /**
   * findBy and waitFor hang under this file's faked setTimeout (RTL's poll
   * interval rides it, unadvanced), and a fixed settle lost the race on the
   * CI runner (attempts 1+2 of 1b1a7c4). Poll by hand: advance fake time in
   * slices and yield one REAL event-loop turn per round (setImmediate is
   * not in toFake), so both fake-timer deferrals and real async boundaries
   * get covered whatever the runner's speed.
   */
  async function pollFor(query: () => HTMLElement | null): Promise<HTMLElement> {
    for (let i = 0; i < 40; i++) {
      const el = query();
      if (el) return el;
      await settle(50);
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("pollFor: element never appeared");
  }

  it("the pane footer gets Buy ↗ and More → Buy this deck… opens the link dialog without writing", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    const input = screen.getByRole("combobox", { name: "Card search" });
    fireEvent.change(input, { target: { value: "sol" } });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Add Sol Ring to Main deck" }));
    await settle(5500);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);

    // The pane footer's Buy ↗ (between the price and the card-page link):
    // the single-card name-search URL, new tab, plain rel while env-dark.
    const pane = section("Card detail and suggestions");
    const buyLink = within(pane).getByRole("link", { name: "Buy" });
    expect(buyLink.getAttribute("href")).toBe(
      "https://www.tcgplayer.com/search/magic/product?q=Sol%20Ring",
    );
    expect(buyLink.getAttribute("target")).toBe("_blank");
    expect(buyLink.getAttribute("rel")).toBe("noopener");

    // More → Buy this deck… → the dialog lists real Mass Entry links.
    openMenu(screen.getByRole("button", { name: "More" }));
    const menu = await pollFor(() => screen.queryByRole("menu", { name: "More" }));
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Buy this deck…" }));
    const dialog = await pollFor(() => screen.queryByRole("dialog", { name: "Buy this deck" }));
    // Button render={<a/>} keeps role button (W4 gotcha) — real hrefs still.
    const whole = within(dialog).getByRole("button", { name: /Whole deck/ });
    expect(whole.tagName).toBe("A");
    expect(whole.getAttribute("href")).toBe(massEntryUrl("Magic", ["1 Sol Ring"]));
    expect(whole.getAttribute("target")).toBe("_blank");
    expect(within(dialog).getByRole("button", { name: /Without basic lands/ })).toBeTruthy();
    expect(dialog.textContent).toContain(
      "Opens TCGplayer Mass Entry in a new tab · prices via Scryfall, updated daily.",
    );
    // Looking at buy links is never an edit: still one create, one PUT.
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
  });
});
