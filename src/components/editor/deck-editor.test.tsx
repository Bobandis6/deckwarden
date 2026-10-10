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
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

/** Y4a's facts GET: every feed fresh (the route's freshness, as the adapter judges it). */
const FRESH_FACTS = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: Object.fromEntries(
    ["gameChangers", "landDenial", "extraTurns", "combos"].map((feed) => [
      feed,
      { state: "ok", asOf: "2026-10-04T15:29:34.768Z" },
    ]),
  ),
};
const factsGets = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/combos/complete?"));

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
  if (url.startsWith("/api/combos/complete?")) return ok({ combos: [], freshness: FRESH_FACTS });
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
const slot = () => document.querySelector<HTMLElement>("[data-slot=save-slot]")!;
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
  // Unmount while fetch is still the mock: an editor left dirty on a live
  // deck sends its keepalive PUT on unmount (LATER row 161's fix), and
  // setup.ts's cleanup only runs after this hook has unstubbed fetch.
  cleanup();
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

describe("DeckEditor — Start from this precon (W8b)", () => {
  const SEED_PRINTING = "bbbbbbbb-0000-4000-8000-000000000001";
  const commander = card({
    name: "Atraxa, Praetors' Voice",
    primaryType: "Creature",
    isLeaderCandidate: true,
  });
  const preconFiller = Array.from({ length: 99 }, (_, i) =>
    card({ name: `Precon Card ${i + 1}`, primaryType: "Artifact", costValue: 2 }),
  );
  const preconCards = [
    {
      cardId: commander.id,
      zone: "commander",
      qty: 1,
      tags: [],
      printingId: SEED_PRINTING,
      card: { ...commander, image: null },
    },
    ...preconFiller.map((c, i) => ({
      cardId: c.id,
      zone: "main",
      qty: 1,
      tags: [],
      printingId: i === 0 ? "bbbbbbbb-0000-4000-8000-000000000002" : null,
      card: { ...c, image: null },
    })),
  ];
  const preconResponse = {
    precon: {
      slug: "breed_lethality_c16",
      code: "BreedLethality_C16",
      setCode: "C16",
      setName: "Commander 2016",
      releaseDate: "2016-11-11",
      productName: "Breed Lethality",
    },
    deck: {
      publicId: "p_breed_lethality_c16",
      name: "Breed Lethality",
      description: null,
      game: "mtg",
      format: "commander",
      leaderIds: [commander.id],
      ciMask: 23,
    },
    cards: preconCards,
  };

  function preconRoute(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    if (url === "/api/precons/breed_lethality_c16") return ok(preconResponse);
    if (url.startsWith("/api/precons/")) return { ok: false, status: 404, json: async () => ({}) };
    return route(input, init);
  }

  /** The last-describe pattern: findBy/waitFor hang under this file's faked setTimeout. */
  async function pollFor(query: () => HTMLElement | null): Promise<HTMLElement> {
    for (let i = 0; i < 40; i++) {
      const el = query();
      if (el) return el;
      await settle(50);
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("pollFor: element never appeared");
  }

  const patches = () =>
    fetchMock.mock.calls.filter(
      ([url, init]) => String(url).startsWith("/api/decks/") && init?.method === "PATCH",
    ).length;

  it("seeds 100 cards WITH the precon's printings and the product name, fires no POST; the first edit = exactly one POST (carrying the name) + one PUT, no PATCH", async () => {
    fetchMock.mockImplementation(preconRoute);
    stubViewport(1440);
    render(
      <DeckEditor
        deckId={null}
        draftGame="mtg"
        draftFormat="commander"
        draftFromSlug="breed_lethality_c16"
      />,
    );
    // The seeded commander shows in several places (leader zone, card pane) —
    // any one of them proves the seed landed.
    await pollFor(() => screen.queryAllByText("Atraxa, Praetors' Voice")[0] ?? null);

    // The whole list is on screen, the name is the product's, nothing saved.
    expect(within(section("Deck list")).getByText("Precon Card 1")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Deck name" }) as HTMLInputElement).value).toBe(
      "Breed Lethality",
    );
    await settle(1500);
    expect(posts()).toBe(0);
    expect(puts()).toBe(0);
    expect(saveStatus()).toBe("saved");

    // First real edit: one create carrying the seeded name, one full PUT
    // with the precon's own printingIds intact, and NO meta PATCH.
    const input = screen.getByRole("combobox", { name: "Card search" });
    fireEvent.change(input, { target: { value: "sol" } });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Add Sol Ring to Main deck" }));
    await settle(1500);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    expect(patches()).toBe(0);
    const createBody = JSON.parse(
      fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/decks" && init?.method === "POST",
      )![1]!.body as string,
    ) as { name?: string };
    expect(createBody.name).toBe("Breed Lethality");
    const saved = lastPutEntries();
    expect(saved).toHaveLength(101);
    expect(saved.find((e) => e.cardId === commander.id)?.printingId).toBe(SEED_PRINTING);
    expect(saved.filter((e) => e.printingId !== undefined)).toHaveLength(2);
  });

  it("an unknown from= seeds nothing and SAYS so", async () => {
    fetchMock.mockImplementation(preconRoute);
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftFromSlug="nope" />,
    );
    await pollFor(() =>
      screen.queryByText("Couldn't find that precon — starting an empty deck instead."),
    );
    await settle(1500);
    expect(posts()).toBe(0);
    expect(puts()).toBe(0);
    expect(saveStatus()).toBe("saved");
    expect(screen.queryByText("Precon Card 1")).toBeNull();
  });

  it("a game/format mismatch is treated exactly like an unknown slug", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/precons/breed_lethality_c16") {
        return ok({
          ...preconResponse,
          deck: { ...preconResponse.deck, game: "optcg", format: "standard" },
        });
      }
      return route(input, init);
    });
    stubViewport(1440);
    render(
      <DeckEditor
        deckId={null}
        draftGame="mtg"
        draftFormat="commander"
        draftFromSlug="breed_lethality_c16"
      />,
    );
    await pollFor(() =>
      screen.queryByText("Couldn't find that precon — starting an empty deck instead."),
    );
    expect(screen.queryByText("Atraxa, Praetors' Voice")).toBeNull();
    expect(posts()).toBe(0);
  });
});

describe("DeckEditor — Build around this combo (X3)", () => {
  const kiki = card({
    name: "Kiki-Jiki, Mirror Breaker",
    primaryType: "Creature",
    costValue: 5,
    isLeaderCandidate: true,
    ciMask: 8,
    externalKey: "a34b7416-cfe3-4a1e-a8c1-a3056b747519",
  });
  const conscripts = card({
    name: "Zealous Conscripts",
    primaryType: "Creature",
    costValue: 5,
    ciMask: 8,
    cheapestUsd: 0.35,
    externalKey: "1dae6f39-2cbd-485c-b190-017a26401fd4",
  });
  const tower = card({ name: "Command Tower", primaryType: "Land", costValue: null });
  const comboResponse = {
    combo: {
      id: 106877,
      externalKey: "618-1537",
      results: ["Infinite creature tokens with haste"],
      templates: [],
      popularity: 28185,
      pieces: [
        { id: kiki.id, name: kiki.name, externalKey: kiki.externalKey },
        { id: conscripts.id, name: conscripts.name, externalKey: conscripts.externalKey },
      ],
    },
    cards: [
      { ...kiki, image: null },
      { ...conscripts, image: null },
    ],
  };
  const shellResponse = {
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
            source: "land-template",
            why: "Fills the land template",
            with: [],
            howOften: null,
            confidence: "medium",
          },
        ],
      },
    ],
    groups: [{ id: "base", label: "Lands", picks: 1 }],
    notes: [],
    totals: { picks: 1, estUsd: 0.23, unpriced: 0 },
    issues: [],
    cards: [
      { ...kiki, image: null },
      { ...conscripts, image: null },
      { ...tower, image: null },
    ],
  };

  /** The pair as loadCompleteCombos stores it — complete in any id set holding both pieces. */
  const kikiFacts = {
    key: "618-1537",
    cardPieces: [kiki.id, conscripts.id].sort(),
    templates: [],
    tag: "C",
    relevant: true,
    results: ["Infinite creature tokens with haste"],
    popularity: 28185,
  };
  /** The X3 seed GET (/api/combos/<key>) — never Y4a's facts GET (/api/combos/complete). */
  const comboSeedGets = () =>
    fetchMock.mock.calls.filter(([url]) => /^\/api\/combos\/[0-9]/.test(String(url)));

  function comboRoute(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    if (url === "/api/combos/618-1537") return ok(comboResponse);
    if (url.startsWith("/api/combos/complete?")) {
      const ids = new URL(url, "http://localhost").searchParams.get("ids")!.split(",");
      const held = kikiFacts.cardPieces.every((id) => ids.includes(id));
      return ok({ combos: held ? [kikiFacts] : [], freshness: FRESH_FACTS });
    }
    if (url.startsWith("/api/combos/")) {
      return { ok: false, status: 404, json: async () => ({ error: "Unknown combo" }) };
    }
    if (url === "/api/cards/resolve") {
      return ok({ results: [{ match: { ...kiki, image: null } }] });
    }
    if (url === "/api/decks/autofill") return { ...ok(shellResponse), headers: new Headers() };
    return route(input, init);
  }

  const autofillBodies = () =>
    fetchMock.mock.calls
      .filter(([url, init]) => String(url) === "/api/decks/autofill" && init?.method === "POST")
      .map(
        ([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
      );

  /** The last-describe pattern: findBy/waitFor hang under this file's faked setTimeout. */
  async function pollFor(query: () => HTMLElement | null): Promise<HTMLElement> {
    for (let i = 0; i < 40; i++) {
      const el = query();
      if (el) return el;
      await settle(50);
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("pollFor: element never appeared");
  }

  it("?leader=&combo=&autofill=1: ONE combo GET seeds the commander and the pieces, and the sheet opens only after they land — its first POST keeps the pieces, never the commander; zero creates", async () => {
    fetchMock.mockImplementation(comboRoute);
    stubViewport(1440);
    render(
      <DeckEditor
        deckId={null}
        draftGame="mtg"
        draftFormat="commander"
        draftLeaderKey={kiki.externalKey}
        draftComboKey="618-1537"
        draftAutofill
      />,
    );
    await pollFor(() => screen.queryByRole("button", { name: "Add 1 card" }));
    const [first, ...rest] = autofillBodies();
    expect(rest).toHaveLength(0);
    expect(first.leaderIds).toEqual([kiki.id]);
    expect(first.keep).toEqual([{ cardId: conscripts.id, zone: "main", qty: 1 }]);
    // One seeder: the combo GET, never the leader seeder's resolve POST.
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/combos/618-1537"),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/cards/resolve"),
    ).toHaveLength(0);
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");
    // The sheet is built around the combo: its title, its lead, the piece pinned first.
    expect(screen.getByRole("dialog", { name: "Build around this combo" })).toBeTruthy();
    expect(
      screen.getByText(
        "Kiki-Jiki, Mirror Breaker + Zealous Conscripts. The rest comes from real decklists and tournament results — every pick shows why.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Combo pieces · 1")).toBeTruthy();
    // The draft holds the commander in the command zone and the piece in the deck.
    expect(within(section("Deck list")).getAllByText("Zealous Conscripts").length).toBeGreaterThan(
      0,
    );
  });

  const comboDraft = (over: Partial<Parameters<typeof DeckEditor>[0]> = {}) => (
    <DeckEditor
      deckId={null}
      draftGame="mtg"
      draftFormat="commander"
      draftLeaderKey={kiki.externalKey}
      draftComboKey="618-1537"
      {...over}
    />
  );

  it("Apply is ONE edit: one create + one PUT with the commander, the piece and the picks; Undo restores the seeded pair", async () => {
    fetchMock.mockImplementation(comboRoute);
    stubViewport(1440);
    render(comboDraft({ draftAutofill: true }));
    const apply = await pollFor(() => screen.queryByRole("button", { name: "Add 1 card" }));
    fireEvent.click(apply);
    await pollFor(() => screen.queryByText("Added 1 card"));
    await settle(1500);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    expect(lastPutEntries().map((e) => e.cardId)).toEqual(
      expect.arrayContaining([kiki.id, conscripts.id, tower.id]),
    );
    expect(lastPutEntries()).toHaveLength(3);
    // The sheet is gone (the toast is Base UI's other role="dialog").
    expect(screen.queryByRole("dialog", { name: "Build around this combo" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle(1500);
    await act(async () => {});
    expect(puts()).toBe(2);
    expect(
      lastPutEntries()
        .map((e) => e.cardId)
        .sort(),
    ).toEqual([kiki.id, conscripts.id].sort());
    expect(posts()).toBe(1);
  });

  it("without ?autofill=1 (a reload keeps `combo`, the chooser strips `autofill`): the pair seeds state-only, no sheet, no POST at all", async () => {
    fetchMock.mockImplementation(comboRoute);
    stubViewport(1440);
    render(comboDraft());
    await pollFor(
      () => within(section("Deck list")).queryAllByText("Zealous Conscripts")[0] ?? null,
    );
    await settle(1500);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toHaveLength(0);
    expect(saveStatus()).toBe("saved");
  });

  it("no latch, no pin: More → Autofill… on a combo-seeded draft opens the PLAIN sheet — the piece is an ordinary keep there", async () => {
    fetchMock.mockImplementation(comboRoute);
    stubViewport(1440);
    render(comboDraft());
    await pollFor(
      () => within(section("Deck list")).queryAllByText("Zealous Conscripts")[0] ?? null,
    );
    const trigger = screen.getByRole("button", { name: "More" });
    fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(trigger, { button: 0 });
    fireEvent.click(trigger, { button: 0 });
    const menu = await pollFor(() => screen.queryByRole("menu", { name: "More" }));
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Autofill…" }));
    await pollFor(() => screen.queryByRole("button", { name: "Add 1 card" }));
    expect(screen.getByRole("dialog", { name: "Autofill a starter shell" })).toBeTruthy();
    expect(screen.queryByText(/Combo pieces/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Keep my 1 card" })).toBeTruthy();
    expect(posts()).toBe(0);
  });

  it("an unknown (or since-deleted) key seeds nothing and SAYS so; with ?autofill=1 the sheet degrades to its no-commander sentence, POST-free", async () => {
    fetchMock.mockImplementation(comboRoute);
    stubViewport(1440);
    render(comboDraft({ draftComboKey: "999-999", draftAutofill: true }));
    await pollFor(() =>
      screen.queryByText("Couldn't find that combo — starting an empty deck instead."),
    );
    await pollFor(() => screen.queryByText(/Set a commander first/));
    expect(autofillBodies()).toHaveLength(0);
    expect(posts()).toBe(0);
    expect(screen.queryByText("Kiki-Jiki, Mirror Breaker")).toBeNull();
  });

  it("a combo link with no leader seeds nothing and says so — without even asking for the combo", async () => {
    fetchMock.mockImplementation(comboRoute);
    stubViewport(1440);
    render(comboDraft({ draftLeaderKey: undefined }));
    await pollFor(() =>
      screen.queryByText("That combo link names no commander — starting an empty deck instead."),
    );
    expect(comboSeedGets()).toHaveLength(0);
    expect(posts()).toBe(0);
  });

  it("a leader that is not one of the combo's pieces — or not a commander — seeds nothing and says so", async () => {
    fetchMock.mockImplementation(comboRoute);
    stubViewport(1440);
    // Zealous Conscripts IS a piece, but it cannot be the commander.
    render(comboDraft({ draftLeaderKey: conscripts.externalKey }));
    await pollFor(() =>
      screen.queryByText(
        "That combo doesn't include that commander — starting an empty deck instead.",
      ),
    );
    expect(within(section("Deck list")).queryByText("Zealous Conscripts")).toBeNull();
    expect(posts()).toBe(0);
  });

  it("one seeder: a precon (`from`) or a random roll (`surprise`) beats a combo — the combo is never fetched", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/leaders/random")) {
        return ok({ leader: { ...kiki, name: "Rolled Commander", image: null } });
      }
      if (url.startsWith("/api/precons/"))
        return { ok: false, status: 404, json: async () => ({}) };
      return comboRoute(input, init);
    });
    stubViewport(1440);
    const { unmount } = render(comboDraft({ draftFromSlug: "nope" }));
    await pollFor(() =>
      screen.queryByText("Couldn't find that precon — starting an empty deck instead."),
    );
    unmount();
    render(comboDraft({ draftSurprise: true }));
    await pollFor(() => screen.queryAllByText("Rolled Commander")[0] ?? null);
    expect(comboSeedGets()).toHaveLength(0);
    expect(posts()).toBe(0);
  });

  it("One Piece declares no combos: `combo` is ignored — the leader seeds as if it were absent, no toast", async () => {
    fetchMock.mockImplementation(comboRoute);
    stubViewport(1440);
    render(
      <DeckEditor
        deckId={null}
        draftGame="optcg"
        draftFormat="standard"
        draftLeaderKey="OP15-058"
        draftComboKey="618-1537"
      />,
    );
    // The resolve mock answers Kiki's wire; the point is which seeder ran.
    await pollFor(() => screen.queryAllByText("Kiki-Jiki, Mirror Breaker")[0] ?? null);
    expect(comboSeedGets()).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/cards/resolve"),
    ).toHaveLength(1);
    expect(screen.queryByText(/combo/i)).toBeNull();
  });

  // ----------------------------------------------------------------- Y4a
  describe("the bracket line (Y4a)", () => {
    const bracketLine = () => document.querySelector<HTMLElement>("[data-slot=bracket-line]");

    it("a combo-seeded draft shows its combo before any save: ONE facts GET keyed by the sorted ids — a GET, zero POSTs — and Why? opens the sheet with it", async () => {
      fetchMock.mockImplementation(comboRoute);
      stubViewport(1440);
      render(comboDraft());
      await pollFor(() =>
        bracketLine()?.textContent === "Bracket: add 98 more cards · 1 combo so far · Why?"
          ? bracketLine()
          : null,
      );
      expect(factsGets().map(([url]) => String(url))).toEqual([
        `/api/combos/complete?game=mtg&ids=${[kiki.id, conscripts.id].sort().join(",")}`,
      ]);
      expect((factsGets()[0][1] as RequestInit | undefined)?.method).toBeUndefined();
      expect(
        fetchMock.mock.calls.filter(
          ([, init]) => (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toHaveLength(0);
      expect(saveStatus()).toBe("saved");

      fireEvent.click(screen.getByRole("button", { name: "Why?" }));
      const sheet = await pollFor(() =>
        screen.queryByRole("dialog", { name: "Why this bracket?" }),
      );
      expect(
        within(sheet).getByText(
          "Two-card combo with your commander: Kiki-Jiki, Mirror Breaker + Zealous Conscripts. Brackets 1 and 2 expect none.",
        ),
      ).toBeTruthy();
      expect(
        within(sheet)
          .getByRole("link", { name: /How it works/ })
          .getAttribute("href"),
      ).toBe("https://commanderspellbook.com/combo/618-1537/");
      expect(posts()).toBe(0);
    });

    it("One Piece declares no read: no line and no facts GET, whatever its leader", async () => {
      fetchMock.mockImplementation(comboRoute);
      stubViewport(1440);
      render(
        <DeckEditor
          deckId={null}
          draftGame="optcg"
          draftFormat="standard"
          draftLeaderKey="OP15-058"
        />,
      );
      await pollFor(() => screen.queryAllByText("Kiki-Jiki, Mirror Breaker")[0] ?? null);
      await settle(1500);
      expect(bracketLine()).toBeNull();
      expect(factsGets()).toHaveLength(0);
    });
  });
});

describe("DeckEditor — Autofill review sheet + doors (W9b/W9c)", () => {
  const commander = card({
    name: "Atraxa, Praetors' Voice",
    primaryType: "Creature",
    isLeaderCandidate: true,
    ciMask: 23,
  });
  const tower = card({ name: "Command Tower", primaryType: "Land", costValue: null });
  const wastes = card({ name: "Wastes", primaryType: "Land", costValue: null });
  const templateEvidence = {
    source: "land-template",
    why: "Fills the land template",
    with: [],
    howOften: null,
    confidence: "medium",
  };
  const shellResponse = {
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
        evidence: [templateEvidence],
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
        evidence: [templateEvidence],
      },
    ],
    groups: [{ id: "base", label: "Lands", picks: 12 }],
    notes: [],
    totals: { picks: 12, estUsd: 1.33, unpriced: 0 },
    issues: [],
    cards: [
      { ...commander, image: null },
      { ...tower, image: null },
      { ...wastes, image: null },
    ],
  };

  const autofillPosts = () =>
    fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === "/api/decks/autofill" && init?.method === "POST",
    ).length;

  function autofillRoute(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    if (url === "/api/cards/resolve") {
      return ok({ results: [{ match: { ...commander, image: null } }] });
    }
    if (url === "/api/decks/autofill") {
      return { ...ok(shellResponse), headers: new Headers() };
    }
    return route(input, init);
  }

  /** The last-describe pattern: findBy/waitFor hang under this file's faked setTimeout. */
  async function pollFor(query: () => HTMLElement | null): Promise<HTMLElement> {
    for (let i = 0; i < 40; i++) {
      const el = query();
      if (el) return el;
      await settle(50);
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("pollFor: element never appeared");
  }

  it("the EmptyState door needs a commander; Apply = ONE create + ONE PUT on the next autosave; the toast's Undo restores the prior list and autosaves", async () => {
    fetchMock.mockImplementation(autofillRoute);
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftLeaderKey="atraxa" />,
    );
    // The seeded commander arrives state-only; the door renders with it.
    const door = await pollFor(() =>
      screen.queryByRole("button", { name: "Autofill a starter shell" }),
    );
    expect(posts()).toBe(0);

    fireEvent.click(door);
    const apply = await pollFor(() => screen.queryByRole("button", { name: "Add 12 cards" }));
    expect(autofillPosts()).toBe(1);
    // Loading a shell dirties nothing and mints nothing.
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");

    fireEvent.click(apply);
    await pollFor(() => screen.queryByText("Added 12 cards"));
    await settle(1500);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    const saved = lastPutEntries();
    expect(saved).toHaveLength(3); // commander + Command Tower + Wastes ×11
    expect(saved.find((e) => e.cardId === commander.id)).toBeTruthy();

    // Undo is a REAL edit: the previous (leader-only) list autosaves back.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle(1500);
    await act(async () => {});
    expect(puts()).toBe(2);
    expect(lastPutEntries()).toHaveLength(1);
    expect(posts()).toBe(1);
  });

  it("Reroll re-POSTs the shell but never touches the deck — no create, no dirty; closing without applying changes nothing", async () => {
    fetchMock.mockImplementation(autofillRoute);
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftLeaderKey="atraxa" />,
    );
    const door = await pollFor(() =>
      screen.queryByRole("button", { name: "Autofill a starter shell" }),
    );
    fireEvent.click(door);
    await pollFor(() => screen.queryByRole("button", { name: "Add 12 cards" }));

    fireEvent.click(screen.getByRole("button", { name: "Reroll" }));
    await pollFor(() => screen.queryByRole("button", { name: "Add 12 cards" }));
    expect(autofillPosts()).toBe(2);
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await settle(1500);
    expect(posts()).toBe(0);
    expect(puts()).toBe(0);
    expect(saveStatus()).toBe("saved");
    expect(within(section("Deck list")).queryByText("Command Tower")).toBeNull();
  });

  it("One Piece: no autofill door — the empty state keeps only Add cards (adapter-gated)", async () => {
    fetchMock.mockImplementation(autofillRoute);
    stubViewport(1440);
    render(
      <DeckEditor
        deckId={null}
        draftGame="optcg"
        draftFormat="standard"
        draftLeaderKey="OP15-058"
      />,
    );
    await pollFor(() => screen.queryAllByText("Atraxa, Praetors' Voice")[0] ?? null);
    expect(screen.queryByRole("button", { name: "Autofill a starter shell" })).toBeNull();
    expect(
      within(section("Deck list")).getAllByRole("button", { name: "Add cards" }).length,
    ).toBeGreaterThan(0);
  });

  it("MTG without a commander: the door waits — Add cards only", async () => {
    fetchMock.mockImplementation(autofillRoute);
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    await pollFor(() => within(section("Deck list")).queryByText("No cards yet"));
    expect(screen.queryByRole("button", { name: "Autofill a starter shell" })).toBeNull();
  });

  // ------------------------------------------------------------------- W9c
  const anyPosts = () =>
    fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
      .length;

  function surpriseRoute(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    if (url.startsWith("/api/leaders/random")) {
      return ok({ leader: { ...commander, image: null } });
    }
    return autofillRoute(input, init);
  }

  it("Surprise me: the random leader seeds state-only off the GET — literally zero POSTs, no deck row, no sheet", async () => {
    fetchMock.mockImplementation(surpriseRoute);
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftSurprise />);
    await pollFor(() => screen.queryAllByText("Atraxa, Praetors' Voice")[0] ?? null);
    expect(anyPosts()).toBe(0); // the wire rides the GET — no resolve spent
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");
    expect(screen.queryByRole("dialog")).toBeNull();
    // The seeded commander arms the EmptyState door (the sheet is one click away).
    expect(screen.getByRole("button", { name: "Autofill a starter shell" })).toBeTruthy();
  });

  it("Surprise me on One Piece: a random leader into a normal draft — no sheet, no door, no apology copy", async () => {
    fetchMock.mockImplementation(surpriseRoute);
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="optcg" draftFormat="standard" draftSurprise />);
    await pollFor(() => screen.queryAllByText("Atraxa, Praetors' Voice")[0] ?? null);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Autofill a starter shell" })).toBeNull();
    expect(posts()).toBe(0);
  });

  it("?autofill=1 with a leader seed: the sheet opens by itself AFTER the seed lands — one autofill POST, no create, never an auto-apply", async () => {
    fetchMock.mockImplementation(autofillRoute);
    stubViewport(1440);
    render(
      <DeckEditor
        deckId={null}
        draftGame="mtg"
        draftFormat="commander"
        draftLeaderKey="atraxa"
        draftAutofill
      />,
    );
    // No door click anywhere — the latch opens the sheet once the seed settles.
    const apply = await pollFor(() => screen.queryByRole("button", { name: "Add 12 cards" }));
    expect(apply).toBeTruthy();
    expect(autofillPosts()).toBe(1);
    expect(posts()).toBe(0);
    expect(saveStatus()).toBe("saved");
    // The sheet request was built around the seeded commander.
    expect(screen.getAllByText(/Atraxa, Praetors' Voice/).length).toBeGreaterThan(0);
  });

  it("a crafted bare ?autofill=1 (no leader, no seed): the sheet's honest no-leader sentence, zero autofill POSTs", async () => {
    fetchMock.mockImplementation(autofillRoute);
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftAutofill />);
    await pollFor(() => screen.queryByText(/Set a commander first/));
    expect(autofillPosts()).toBe(0);
    expect(posts()).toBe(0);
  });
});

// ------------------------------------------------------------------- Y2a
describe("DeckEditor — an honest first screen (Y2a)", () => {
  const atraxa = card({
    name: "Atraxa, Praetors' Voice",
    primaryType: "Creature",
    isLeaderCandidate: true,
  });
  const extras = Array.from({ length: 3 }, (_, i) =>
    card({ name: `Seed Card ${i + 1}`, primaryType: "Artifact", costValue: 2 }),
  );
  const seedResponse = {
    deck: { name: "Tiny Precon", game: "mtg", format: "commander", leaderIds: [atraxa.id] },
    cards: [
      {
        cardId: atraxa.id,
        zone: "commander",
        qty: 1,
        tags: [],
        printingId: null,
        card: { ...atraxa, image: null },
      },
      ...extras.map((c) => ({
        cardId: c.id,
        zone: "main",
        qty: 1,
        tags: [],
        printingId: null,
        card: { ...c, image: null },
      })),
    ],
  };
  function seedRoute(input: RequestInfo | URL, init?: RequestInit) {
    if (String(input) === "/api/precons/tiny") return ok(seedResponse);
    return route(input, init);
  }
  async function pollFor(query: () => HTMLElement | null): Promise<HTMLElement> {
    for (let i = 0; i < 40; i++) {
      const el = query();
      if (el) return el;
      await settle(50);
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("pollFor: element never appeared");
  }
  const progressLine = () =>
    section("Deck list").querySelector<HTMLElement>('[data-slot="progress-line"]');

  it("a fresh Magic draft: Draft (no check, data-draft), the progress line, no View / Group / Sort, one Add cards; the first edit ends the draft with one create", async () => {
    stubViewport(375);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    expect(saveStatus()).toBe("saved");
    expect(slot().dataset.draft).toBe("true");
    expect(slot().textContent).toBe("Draft");
    expect(slot().getAttribute("title")).toBe("Saves on your first change");
    expect(slot().querySelector("svg")).toBeNull();
    expect(progressLine()?.textContent).toBe("Choose a commander · 100 to go");
    expect(within(section("Deck list")).getByText("0 / 100 · 100 to go")).toBeTruthy();
    // Progress is not a problem: no red count, and never the approval line.
    expect(within(section("Deck list")).queryByRole("button", { name: /problem/ })).toBeNull();
    expect(screen.queryByText(/The Warden approves/)).toBeNull();
    expect(screen.queryByRole("group", { name: "View" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Sort" })).toBeNull();
    expect(within(section("Deck list")).getAllByRole("button", { name: "Add cards" })).toHaveLength(
      1,
    );
    // An unseeded draft has nothing to keep.
    expect(screen.queryByRole("button", { name: "Keep this deck" })).toBeNull();

    // The first real edit: Unsaved…, then one create, and the draft is over.
    fireEvent.click(within(section("Deck list")).getByRole("button", { name: "Add cards" }));
    const input = screen.getByRole("combobox", { name: "Card search" });
    fireEvent.change(input, { target: { value: "sol" } });
    await settle();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(slot().textContent).toBe("Unsaved…");
    await settle(1100);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(saveStatus()).toBe("saved");
    expect(slot().hasAttribute("data-draft")).toBe(false);
    expect(slot().textContent).toBe("Saved");
    expect(slot().querySelector("svg")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /^Deck/ }));
    expect(screen.getByRole("group", { name: "View" })).toBeTruthy();
    expect(progressLine()?.textContent).toBe("Choose a commander · 99 to go");
  });

  it("One Piece says its own progress through its adapter", () => {
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="optcg" draftFormat="standard" />);
    expect(slot().textContent).toBe("Draft");
    expect(progressLine()?.textContent).toBe("Choose a leader · 50 to go");
    expect(within(section("Deck list")).getByText("0 / 50 · 50 to go")).toBeTruthy();
  });

  it("a precon draft offers Keep this deck: one click = exactly one create + one PUT, then Share", async () => {
    fetchMock.mockImplementation(seedRoute);
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftFromSlug="tiny" />,
    );
    const keep = await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
    expect(slot().textContent).toBe("Draft");
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(progressLine()?.textContent).toBe("96 to go");
    await settle(1500);
    expect(posts()).toBe(0);

    fireEvent.click(keep);
    // Gone at once — the slot leaves "saved", so a second click has nothing to press.
    expect(screen.queryByRole("button", { name: "Keep this deck" })).toBeNull();
    await settle(1500);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    expect(lastPutEntries()).toHaveLength(4);
    expect(window.location.pathname).toBe("/decks/deck-1/edit");
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep this deck" })).toBeNull();
    expect(slot().hasAttribute("data-draft")).toBe(false);
  });

  it("removing a card toasts Removed X · Undo; Undo restores it (quantity, position) and autosaves", async () => {
    fetchMock.mockImplementation(seedRoute);
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftFromSlug="tiny" />,
    );
    fireEvent.click(await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" })));
    await settle(1500);
    await act(async () => {});
    expect(puts()).toBe(1);
    await settle(5500); // the slate is clean: no earlier toast on screen

    const list = section("Deck list");
    fireEvent.click(within(list).getByRole("button", { name: "One more Seed Card 2" }));
    fireEvent.click(within(list).getByRole("button", { name: "Remove Seed Card 2" }));
    expect(within(list).queryByText("Seed Card 2")).toBeNull();
    // Two edits inside the debounce send nothing yet — before LATER row 161's
    // fix, a per-render keepalive flush PUT each one at once.
    expect(puts()).toBe(1);
    const toastEl = (await pollFor(() => screen.queryByText("Removed 2× Seed Card 2"))).closest(
      '[data-slot="toast"]',
    ) as HTMLElement;
    await settle(1500);
    await act(async () => {});
    expect(saveStatus()).toBe("saved");
    expect(puts()).toBe(2);
    expect(lastPutEntries().some((e) => e.cardId === extras[1].id)).toBe(false);

    fireEvent.click(within(toastEl).getByRole("button", { name: "Undo" }));
    expect(within(list).getByText("Seed Card 2")).toBeTruthy();
    expect(saveStatus()).toBe("dirty");
    await settle(1500);
    await act(async () => {});
    expect(saveStatus()).toBe("saved");
    expect(posts()).toBe(1);
    expect(puts()).toBe(3);
    const restored = lastPutEntries() as { cardId: string; qty?: number }[];
    expect(restored.map((e) => e.cardId)).toEqual([atraxa.id, ...extras.map((c) => c.id)]);
    expect(restored[2].qty).toBe(2);
  });

  it("a stepper reaching zero is a removal with the same Undo", async () => {
    fetchMock.mockImplementation(seedRoute);
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftFromSlug="tiny" />,
    );
    await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
    const list = section("Deck list");
    fireEvent.click(within(list).getByRole("button", { name: "One fewer Seed Card 3" }));
    expect(within(list).queryByText("Seed Card 3")).toBeNull();
    const toastEl = (await pollFor(() => screen.queryByText("Removed Seed Card 3"))).closest(
      '[data-slot="toast"]',
    ) as HTMLElement;
    fireEvent.click(within(toastEl).getByRole("button", { name: "Undo" }));
    expect(within(list).getByText("Seed Card 3")).toBeTruthy();
  });
});

describe("DeckEditor — autosave on a saved deck (LATER row 161)", () => {
  /** A hydrated two-card deck: no leader, so no panel fetches. */
  async function renderSaved() {
    stubViewport(1440);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/decks/deck-1" && (init?.method ?? "GET") === "GET") {
        return ok({
          deck: {
            id: "deck-1",
            publicId: "abcdefgh1234",
            game: "mtg",
            format: "commander",
            name: "Saved",
            description: null,
            notes: null,
            visibility: "unlisted",
            isOwner: true,
            forkedFrom: null,
            leaderIds: [],
          },
          cards: [sol, signet].map((c) => ({
            cardId: c.id,
            zone: "main",
            qty: 1,
            tags: [],
            printingId: null,
            card: c,
          })),
          owned: [],
          hasCollection: false,
        });
      }
      return route(input, init);
    });
    const view = render(<DeckEditor deckId="deck-1" />);
    await act(async () => {});
    await act(async () => {});
    return view;
  }
  const list = () => section("Deck list");
  const writes = (method: "PUT" | "PATCH") =>
    fetchMock.mock.calls
      .map(([, init]) => init as RequestInit | undefined)
      .filter((init) => init?.method === method) as RequestInit[];

  it("two quick edits are ONE PUT, a full debounce after the last — never one per edit", async () => {
    await renderSaved();
    fireEvent.click(within(list()).getByRole("button", { name: "One more Sol Ring" }));
    await settle(500);
    fireEvent.click(within(list()).getByRole("button", { name: "One more Arcane Signet" }));
    expect(puts()).toBe(0);
    expect(saveStatus()).toBe("dirty");
    await settle(999);
    expect(puts()).toBe(0);
    await settle(1);
    await act(async () => {});
    expect(puts()).toBe(1);
    expect(writes("PUT")[0].keepalive).toBeUndefined();
    expect(
      (lastPutEntries() as { cardId: string; qty: number }[]).map((e) => [e.cardId, e.qty]),
    ).toEqual([
      [sol.id, 2],
      [signet.id, 2],
    ]);
    expect(saveStatus()).toBe("saved");
  });

  it("typing a name is ONE PATCH after the debounce, never one per keystroke", async () => {
    await renderSaved();
    const name = screen.getByRole("textbox", { name: "Deck name" });
    for (const value of ["Saved!", "Saved!!", "Saved!!!"]) {
      fireEvent.change(name, { target: { value } });
    }
    expect(writes("PATCH")).toHaveLength(0);
    await settle(1100);
    await act(async () => {});
    expect(writes("PATCH")).toHaveLength(1);
    expect(JSON.parse(writes("PATCH")[0].body as string)).toMatchObject({ name: "Saved!!!" });
    expect(puts()).toBe(0);
    expect(saveStatus()).toBe("saved");
  });

  it("closing the tab mid-debounce flushes ONE keepalive PUT; the debounce then has nothing left to send", async () => {
    await renderSaved();
    fireEvent.click(within(list()).getByRole("button", { name: "One more Sol Ring" }));
    expect(puts()).toBe(0);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(puts()).toBe(1);
    expect(writes("PUT")[0].keepalive).toBe(true);
    await settle(1100);
    await act(async () => {});
    expect(puts()).toBe(1);
    expect(saveStatus()).toBe("saved");
  });

  it("leaving the editor mid-debounce (an unmount) flushes ONE keepalive PUT", async () => {
    const view = await renderSaved();
    fireEvent.click(within(list()).getByRole("button", { name: "One more Sol Ring" }));
    expect(puts()).toBe(0);
    view.unmount();
    expect(puts()).toBe(1);
    expect(writes("PUT")[0].keepalive).toBe(true);
    await settle(1100);
    expect(puts()).toBe(1);
  });
});

// ------------------------------------------------------------------- Y2b
describe("DeckEditor — start doors, draft Suggestions, the first approval (Y2b)", () => {
  const kozilek: CardWire = {
    ...card({
      name: "Kozilek, the Great Distortion",
      primaryType: "Creature",
      costValue: 10,
      isLeaderCandidate: true,
      attrs: { type_line: "Legendary Creature — Eldrazi", oracle_text: "" },
    }),
    image: null,
  };
  const wastes: CardWire = {
    ...card({
      name: "Wastes",
      primaryType: "Land",
      costValue: null,
      attrs: { type_line: "Basic Land — Wastes", oracle_text: "" },
    }),
    image: null,
  };
  /** A legal colorless Commander list: Kozilek + `n` Wastes. */
  const cardsOf = (n: number) => [
    { cardId: kozilek.id, zone: "commander", qty: 1, tags: [], printingId: null, card: kozilek },
    { cardId: wastes.id, zone: "main", qty: n, tags: [], printingId: null, card: wastes },
  ];
  const savedDeck = (n: number) => ({
    deck: {
      id: "deck-1",
      publicId: "abcdefgh1234",
      game: "mtg",
      format: "commander",
      name: "Kozilek",
      description: null,
      notes: null,
      visibility: "unlisted",
      isOwner: true,
      forkedFrom: null,
      leaderIds: [kozilek.id],
    },
    cards: cardsOf(n),
    owned: [],
    hasCollection: false,
  });

  let savedSize = 99;
  function y2bRoute(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/leaders/random")) return ok({ leader: kozilek });
    if (url === "/api/recommendations") return ok({ count: 0, recommendations: [] });
    if (url === "/api/precons/missing") return { ok: false, status: 404, json: async () => ({}) };
    if (url === "/api/precons/kozilek") {
      return ok({
        deck: { name: "Colorless", game: "mtg", format: "commander", leaderIds: [kozilek.id] },
        cards: cardsOf(99),
      });
    }
    if (url === "/api/cards/resolve") {
      return ok({ results: [{ input: "Sol Ring", match: sol, suggestions: [] }] });
    }
    if (url === "/api/decks/deck-1" && method === "GET") return ok(savedDeck(savedSize));
    return route(input, init);
  }

  beforeEach(() => {
    savedSize = 99;
    fetchMock.mockImplementation(y2bRoute);
  });

  const anyPosts = () =>
    fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
      .length;
  const snapshotPosts = () =>
    fetchMock.mock.calls.filter(([url]) => String(url) === "/api/recommendations");
  const list = () => within(section("Deck list"));
  /** The empty list's action row, in order: what each control is and says. */
  const emptyActions = () => {
    const title = list().getByText("No cards yet");
    const row = title.parentElement!.lastElementChild!.firstElementChild as HTMLElement;
    return [...row.children].map((el) =>
      el.tagName === "A" ? `${el.textContent} → ${el.getAttribute("href")}` : el.textContent,
    );
  };
  async function pollFor(query: () => HTMLElement | null): Promise<HTMLElement> {
    for (let i = 0; i < 40; i++) {
      const el = query();
      if (el) return el;
      await settle(50);
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("pollFor: element never appeared");
  }

  it("a fresh Magic draft: after Add cards, Paste a list · Start from a precon · Surprise me — and none of them creates a thing", () => {
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    expect(emptyActions()).toEqual([
      "Add cards",
      "Paste a list",
      "Start from a precon → /precons",
      "Surprise me",
    ]);
    // The Pick door is the leader zone's own Browse link — never repeated.
    expect(list().getAllByRole("link", { name: /Browse commanders/ })).toHaveLength(1);
    expect(list().queryByRole("link", { name: "Pick a commander" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("One Piece: Paste a list only — no precon, no Surprise me; Browse leaders stays in the leader zone", () => {
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="optcg" draftFormat="standard" />);
    expect(emptyActions()).toEqual(["Add cards", "Paste a list"]);
    expect(list().getByRole("link", { name: /Browse leaders/ })).toBeTruthy();
  });

  it("Paste a list opens the Import dialog, which creates nothing until Apply — then exactly one deck", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    fireEvent.click(list().getByRole("button", { name: "Paste a list" }));
    const dialog = screen.getByRole("dialog", { name: "Import decklist" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Decklist text" }), {
      target: { value: "1 Sol Ring" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    const add = await pollFor(() => screen.queryByRole("button", { name: "Add to deck" }));
    await settle(1500);
    expect(posts()).toBe(0); // the lookup is the only POST so far
    expect(anyPosts()).toBe(1);

    fireEvent.click(add);
    await settle(1100);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(puts()).toBe(1);
    expect(lastPutEntries().map((e) => e.cardId)).toEqual([sol.id]);
  });

  it("?import=1 (the picker's door) opens the Import dialog by itself, once — and a seeded draft waits for its seed", async () => {
    stubViewport(1440);
    const view = render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftImport />,
    );
    expect(screen.getByRole("dialog", { name: "Import decklist" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    view.unmount();

    render(
      <DeckEditor
        deckId={null}
        draftGame="mtg"
        draftFormat="commander"
        draftFromSlug="kozilek"
        draftImport
      />,
    );
    expect(screen.queryByRole("dialog", { name: "Import decklist" })).toBeNull();
    await pollFor(() => screen.queryByRole("dialog", { name: "Import decklist" }));
    expect(list().getAllByText("Kozilek, the Great Distortion").length).toBeGreaterThan(0);
    expect(posts()).toBe(0);
  });

  it("Surprise me rolls a commander in place, state only — zero POSTs — then offers Keep this deck; the from-nothing doors step aside", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
    fireEvent.click(list().getByRole("button", { name: "Surprise me" }));
    await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
    expect(list().getAllByText("Kozilek, the Great Distortion").length).toBeGreaterThan(0);
    expect(anyPosts()).toBe(0);
    expect(saveStatus()).toBe("saved");
    expect(emptyActions()).toEqual(["Autofill a starter shell", "Add cards", "Paste a list"]);
  });

  it("no door while a seed lands; a seed that fails shows them, and Surprise me still rolls into a keepable draft", async () => {
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftFromSlug="missing" />,
    );
    expect(list().queryByRole("button", { name: "Paste a list" })).toBeNull();
    const surprise = await pollFor(() => list().queryByRole("button", { name: "Surprise me" }));
    fireEvent.click(surprise);
    await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
    expect(posts()).toBe(0);
  });

  it("a seeded draft's Suggestions answer from POST /api/recommendations — only once its tab opens, never twice for the same draft, zero deck creates", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftSurprise />);
    await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
    expect(snapshotPosts()).toHaveLength(0);

    fireEvent.click(screen.getByRole("tab", { name: "Suggestions" }));
    await pollFor(() => screen.queryByText("No suggestions right now."));
    expect(snapshotPosts()).toHaveLength(1);
    expect(JSON.parse((snapshotPosts()[0][1] as RequestInit).body as string)).toEqual({
      game: "mtg",
      format: "commander",
      leaderIds: [kozilek.id],
      entries: [],
    });
    fireEvent.click(screen.getByRole("tab", { name: "Card" }));
    fireEvent.click(screen.getByRole("tab", { name: "Suggestions" }));
    await settle(500);
    expect(snapshotPosts()).toHaveLength(1);
    expect(posts()).toBe(0);
  });

  it("the first approval offers Share this deck under the Warden line → the Share dialog; after a reload that deck is never offered again", async () => {
    savedSize = 98; // Kozilek + 98 Wastes: one card short
    stubViewport(1440);
    const view = render(<DeckEditor deckId="deck-1" />);
    await act(async () => {});
    await act(async () => {});
    expect(screen.queryByText(/The Warden approves/)).toBeNull();

    fireEvent.click(list().getByRole("button", { name: "One more Wastes" }));
    const share = list().getByRole("button", { name: "Share this deck" });
    const line = list().getByRole("status");
    expect(line.textContent).toBe("The Warden approves this deck ✓");
    expect(line.contains(share)).toBe(false);
    fireEvent.click(share);
    expect(screen.getByRole("dialog", { name: "Share deck" })).toBeTruthy();
    await settle(1100);
    await act(async () => {});
    view.unmount();

    // A reload: the deck loads legal (no transition), then dips and comes back.
    savedSize = 99;
    render(<DeckEditor deckId="deck-1" />);
    await act(async () => {});
    await act(async () => {});
    expect(list().queryByRole("button", { name: "Share this deck" })).toBeNull();
    fireEvent.click(list().getByRole("button", { name: "One fewer Wastes" }));
    expect(list().queryByRole("status")).toBeNull();
    fireEvent.click(list().getByRole("button", { name: "One more Wastes" }));
    expect(list().getByRole("status").textContent).toBe("The Warden approves this deck ✓");
    expect(list().queryByRole("button", { name: "Share this deck" })).toBeNull();
  });

  it("a loaded legal deck is never offered Share — opening it is no approval", async () => {
    savedSize = 99; // Kozilek + 99 Wastes: legal as it loads
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await act(async () => {});
    await act(async () => {});
    expect(list().getByRole("status").textContent).toBe("The Warden approves this deck ✓");
    expect(list().queryByRole("button", { name: "Share this deck" })).toBeNull();
  });

  it("a draft that approves before its row offers nothing — Keep this deck mints it, and then the link appears", async () => {
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftFromSlug="kozilek" />,
    );
    const keep = await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
    expect(list().getByRole("status").textContent).toBe("The Warden approves this deck ✓");
    expect(list().queryByRole("button", { name: "Share this deck" })).toBeNull();

    fireEvent.click(keep);
    await settle(1500);
    await act(async () => {});
    expect(posts()).toBe(1);
    expect(list().getByRole("button", { name: "Share this deck" })).toBeTruthy();
  });

  // ------------------------------------------------------ LATER row 164
  describe("an edit undone back to nothing mints no row (LATER row 164)", () => {
    const removeKozilek = () =>
      fireEvent.click(list().getByRole("button", { name: "Remove Kozilek, the Great Distortion" }));

    it("removing a rolled commander: zero creates past the debounce, the slot back to Draft, the doors back — and the next roll keeps with one create + one PUT", async () => {
      stubViewport(1440);
      render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftSurprise />);
      await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));

      removeKozilek();
      expect(saveStatus()).toBe("dirty");
      await settle(1100);
      await act(async () => {});
      expect(posts()).toBe(0);
      expect(saveStatus()).toBe("saved");
      expect(slot().dataset.draft).toBe("true");
      expect(slot().textContent).toBe("Draft");
      expect(window.location.pathname).toBe("/decks/new");
      expect(emptyActions()).toEqual([
        "Add cards",
        "Paste a list",
        "Start from a precon → /precons",
        "Surprise me",
      ]);

      fireEvent.click(list().getByRole("button", { name: "Surprise me" }));
      fireEvent.click(
        await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" })),
      );
      await settle(1500);
      await act(async () => {});
      expect(posts()).toBe(1);
      expect(puts()).toBe(1);
      expect(lastPutEntries().map((e) => e.cardId)).toEqual([kozilek.id]);
    });

    it("Surprise me inside the removal's debounce settles that save first: the new roll stays state only and keepable — zero creates", async () => {
      stubViewport(1440);
      render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftSurprise />);
      await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));

      removeKozilek();
      fireEvent.click(list().getByRole("button", { name: "Surprise me" }));
      await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
      await settle(1500);
      await act(async () => {});
      expect(posts()).toBe(0);
      expect(saveStatus()).toBe("saved");
      expect(slot().textContent).toBe("Draft");
      expect(screen.getByRole("button", { name: "Keep this deck" })).toBeTruthy();
    });

    it("a typed name is something to say — one create carrying it; a name typed and erased inside the debounce is not", async () => {
      stubViewport(1440);
      render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />);
      const name = screen.getByRole("textbox", { name: "Deck name" });
      fireEvent.change(name, { target: { value: "Eldrazi" } });
      fireEvent.change(name, { target: { value: "" } });
      await settle(1100);
      await act(async () => {});
      expect(posts()).toBe(0);
      expect(slot().textContent).toBe("Draft");

      fireEvent.change(name, { target: { value: "Eldrazi" } });
      await settle(1100);
      await act(async () => {});
      expect(posts()).toBe(1);
      const create = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/decks" && init?.method === "POST",
      )!;
      expect(JSON.parse((create[1] as RequestInit).body as string)).toMatchObject({
        name: "Eldrazi",
      });
      expect(slot().hasAttribute("data-draft")).toBe(false);
    });
  });
});

// ------------------------------------------------------------------- Y4a
describe("DeckEditor — the bracket line and its Why sheet (Y4a)", () => {
  const kozilek: CardWire = {
    ...card({
      name: "Kozilek, the Great Distortion",
      primaryType: "Creature",
      costValue: 10,
      isLeaderCandidate: true,
      attrs: { type_line: "Legendary Creature — Eldrazi", oracle_text: "" },
    }),
    image: null,
  };
  const wastes: CardWire = {
    ...card({
      name: "Wastes",
      primaryType: "Land",
      costValue: null,
      attrs: { type_line: "Basic Land — Wastes", oracle_text: "" },
    }),
    image: null,
  };
  /** A legal colorless Commander list, saved: Kozilek + 99 Wastes. */
  const savedDeck = {
    deck: {
      id: "deck-1",
      publicId: "abcdefgh1234",
      game: "mtg",
      format: "commander",
      name: "Kozilek",
      description: null,
      notes: null,
      visibility: "unlisted",
      isOwner: true,
      forkedFrom: null,
      leaderIds: [kozilek.id],
    },
    cards: [
      { cardId: kozilek.id, zone: "commander", qty: 1, tags: [], printingId: null, card: kozilek },
      { cardId: wastes.id, zone: "main", qty: 99, tags: [], printingId: null, card: wastes },
    ],
    owned: [],
    hasCollection: false,
  };
  function y4aRoute(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    if (url === "/api/decks/deck-1" && (init?.method ?? "GET") === "GET") return ok(savedDeck);
    return route(input, init);
  }
  const line = () => document.querySelector<HTMLElement>("[data-slot=bracket-line]");
  const NOTHING = "Bracket 1–2 · nothing here goes past Core · Why?";

  /** The last-describe pattern: findBy/waitFor hang under this file's faked setTimeout. */
  async function pollFor<T>(query: () => T | null): Promise<T> {
    for (let i = 0; i < 40; i++) {
      const found = query();
      if (found) return found;
      await settle(50);
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("pollFor: never appeared");
  }

  beforeEach(() => {
    fetchMock.mockImplementation(y4aRoute);
  });

  it("a saved deck: the line follows the Warden line; a quantity never asks again, a new card asks once after the debounce", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await pollFor(() => (line()?.textContent === NOTHING ? line() : null));
    // On the legality line: directly after the Warden's.
    const warden = screen.getByText(/The Warden approves this deck/).closest("p")!;
    expect(warden.nextElementSibling).toBe(line());
    expect(factsGets().map(([url]) => String(url))).toEqual([
      `/api/combos/complete?game=mtg&ids=${[kozilek.id, wastes.id].sort().join(",")}`,
    ]);

    // Wastes 99 → 98: the same id set — a draft line at once, no new ask.
    fireEvent.click(within(section("Deck list")).getByRole("button", { name: "One fewer Wastes" }));
    expect(line()!.textContent).toBe("Bracket: add 1 more card");
    await settle(2000);
    await act(async () => {});
    expect(factsGets()).toHaveLength(1);

    // A new card changes the set: "Checking combos…" until the debounce asks.
    const input = screen.getByRole("combobox", { name: "Card search" });
    fireEvent.change(input, { target: { value: "sol" } });
    await settle();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(section("Deck list")).getByText("Sol Ring")).toBeTruthy();
    expect(line()!.textContent).toBe("Checking combos…");
    await settle(450);
    expect(factsGets()).toHaveLength(1);
    await settle(100);
    await act(async () => {});
    expect(factsGets()).toHaveLength(2);
    expect(String(factsGets()[1][0])).toBe(
      `/api/combos/complete?game=mtg&ids=${[kozilek.id, sol.id, wastes.id].sort().join(",")}`,
    );
    expect(line()!.textContent).toBe(NOTHING);
    // Only GETs ever asked; the edits PUT as always.
    expect(posts()).toBe(0);
  });

  it("Why? opens from the keyboard (the hotkeys stand down) and Escape hands focus back to it", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    const why = await pollFor(() => screen.queryByRole("button", { name: "Why?" }));
    why.focus();
    expect(document.activeElement).toBe(why);
    fireEvent.click(why); // Enter or Space on a native button
    const sheet = await pollFor(() => screen.queryByRole("dialog", { name: "Why this bracket?" }));
    expect(within(sheet).getByText("Bracket 1–2 · nothing here goes past Core")).toBeTruthy();
    expect(within(sheet).getByRole("region", { name: "What the cards show" })).toBeTruthy();
    expect(within(sheet).getByRole("region", { name: "What this read assumes" })).toBeTruthy();
    // "/" focuses the search box only while no dialog is open.
    fireEvent.keyDown(window, { key: "/" });
    const search = document.querySelector<HTMLElement>('[aria-label="Card search"]');
    expect(search).toBeTruthy();
    expect(document.activeElement).not.toBe(search);

    fireEvent.keyDown(sheet, { key: "Escape" });
    await pollFor(() =>
      screen.queryByRole("dialog", { name: "Why this bracket?" }) ? null : document.body,
    );
    await pollFor(() => (document.activeElement === why ? why : null));
  });

  it("on a phone Why? opens the bottom Drawer", async () => {
    stubViewport(375);
    render(<DeckEditor deckId="deck-1" />);
    fireEvent.click(await pollFor(() => screen.queryByRole("button", { name: "Why?" })));
    const sheet = await pollFor(() => screen.queryByRole("dialog", { name: "Why this bracket?" }));
    expect(
      sheet.closest("[data-slot=drawer-popup]") ??
        sheet.querySelector("[data-slot=drawer-content]"),
    ).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("a facts failure says so with Retry, and Retry asks again", async () => {
    let fail = true;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (fail && String(input).startsWith("/api/combos/complete?")) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      return y4aRoute(input, init);
    });
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await pollFor(() => (line()?.textContent === "Couldn't check combos · Retry" ? line() : null));
    await settle(2000);
    expect(factsGets()).toHaveLength(1);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await pollFor(() => (line()?.textContent === NOTHING ? line() : null));
    expect(factsGets()).toHaveLength(2);
  });

  it("no commander yet: no line and no facts GET — the progress line already says what to do", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/decks/deck-1" && (init?.method ?? "GET") === "GET") {
        return ok({
          ...savedDeck,
          cards: savedDeck.cards.slice(1),
          deck: { ...savedDeck.deck, leaderIds: [] },
        });
      }
      return y4aRoute(input, init);
    });
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await pollFor(() => screen.queryByText("Choose a commander · 1 to go"));
    await settle(2000);
    await act(async () => {});
    expect(line()).toBeNull();
    expect(factsGets()).toHaveLength(0);
  });
});

describe("DeckEditor — your target and the answers (Y4b)", () => {
  const kozilek: CardWire = {
    ...card({
      name: "Kozilek, the Great Distortion",
      primaryType: "Creature",
      costValue: 10,
      isLeaderCandidate: true,
      attrs: { type_line: "Legendary Creature — Eldrazi", oracle_text: "" },
    }),
    image: null,
  };
  const vault: CardWire = {
    ...card({
      name: "Mana Vault",
      primaryType: "Artifact",
      costValue: 1,
      attrs: { type_line: "Artifact", oracle_text: "", game_changer: true },
    }),
    image: null,
  };
  const edge: CardWire = {
    ...card({
      name: "Tectonic Edge",
      primaryType: "Land",
      costValue: null,
      attrs: { type_line: "Land", oracle_text: "", mld: "edge" },
    }),
    image: null,
  };
  const wastes: CardWire = {
    ...card({
      name: "Wastes",
      primaryType: "Land",
      costValue: null,
      attrs: { type_line: "Basic Land — Wastes", oracle_text: "" },
    }),
    image: null,
  };
  /** A commander that is itself a Game Changer — a one-card draft with something to explain. */
  const urza: CardWire = {
    ...card({
      name: "Urza, Lord High Artificer",
      primaryType: "Creature",
      costValue: 4,
      isLeaderCandidate: true,
      attrs: {
        type_line: "Legendary Creature — Human Artificer",
        oracle_text: "",
        game_changer: true,
      },
    }),
    image: null,
  };
  const EDGE_CALL = `land-denial:${edge.externalKey}`;
  const listCards = [
    { cardId: kozilek.id, zone: "commander", qty: 1, tags: [], printingId: null, card: kozilek },
    { cardId: vault.id, zone: "main", qty: 1, tags: [], printingId: null, card: vault },
    { cardId: edge.id, zone: "main", qty: 1, tags: [], printingId: null, card: edge },
    { cardId: wastes.id, zone: "main", qty: 97, tags: [], printingId: null, card: wastes },
  ];
  /** Kozilek, a Game Changer, an edge land-denial card and 97 Wastes: at least 3, a call to 4. */
  function savedDeck(goals: unknown = null) {
    return {
      deck: {
        id: "deck-1",
        publicId: "abcdefgh1234",
        game: "mtg",
        format: "commander",
        name: "Kozilek",
        description: null,
        notes: null,
        visibility: "unlisted",
        isOwner: true,
        forkedFrom: null,
        leaderIds: [kozilek.id],
        goals,
      },
      cards: listCards,
      owned: [],
      hasCollection: false,
    };
  }
  let deckGoals: unknown = null;
  function y4bRoute(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/decks/deck-1" && method === "GET") return ok(savedDeck(deckGoals));
    if (url.startsWith("/api/leaders/random")) return ok({ leader: urza });
    if (url === "/api/precons/kozilek_c99") {
      return ok({
        precon: {
          slug: "kozilek_c99",
          code: "Kozilek_C99",
          setCode: "C99",
          setName: "Commander 2099",
          releaseDate: "2099-01-01",
          productName: "Eldrazi Unbound",
        },
        deck: {
          publicId: "p_kozilek_c99",
          name: "Eldrazi Unbound",
          description: null,
          game: "mtg",
          format: "commander",
          leaderIds: [kozilek.id],
          ciMask: 0,
        },
        cards: listCards,
      });
    }
    return route(input, init);
  }
  const line = () => document.querySelector<HTMLElement>("[data-slot=bracket-line]");
  const patchBodies = () =>
    fetchMock.mock.calls
      .filter(([url, init]) => url === "/api/decks/deck-1" && init?.method === "PATCH")
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as unknown);
  const createBody = () =>
    JSON.parse(
      fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/decks" && init?.method === "POST",
      )![1]!.body as string,
    ) as { goals?: unknown; name?: string };
  const sheet = () => screen.queryByRole("dialog", { name: "Why this bracket?" });

  async function pollFor<T>(query: () => T | null): Promise<T> {
    for (let i = 0; i < 40; i++) {
      const found = query();
      if (found) return found;
      await settle(50);
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("pollFor: never appeared");
  }
  const lineIs = (text: string) => pollFor(() => (line()?.textContent === text ? line() : null));
  async function openSheet() {
    fireEvent.click(await pollFor(() => screen.queryByRole("button", { name: "Why?" })));
    return pollFor(sheet);
  }
  const targetButton = (dialog: HTMLElement, label: string) =>
    within(within(dialog).getByRole("group", { name: "Your target" })).getByRole("button", {
      name: label,
    });

  beforeEach(() => {
    deckGoals = null;
    fetchMock.mockImplementation(y4bRoute);
  });

  it("a saved deck: a target is ONE PATCH {goals} after the debounce — no PUT, no meta PATCH, no second facts GET; the line and the callout follow at once", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await lineIs("Bracket 3 or 4 — one card is your call · Why?");
    const dialog = await openSheet();
    fireEvent.click(targetButton(dialog, "2"));

    expect(line()!.textContent).toBe(
      "Your target: Bracket 2 · the cards say 3 or 4 — one card is your call · Why?",
    );
    const callout = dialog.querySelector<HTMLElement>("[data-slot=bracket-conflicts]")!;
    expect(
      [...callout.querySelectorAll<HTMLElement>("[data-conflict]")].map((r) => r.dataset.conflict),
    ).toEqual(["game-changers"]);
    expect(callout.textContent).toContain("Remove Mana Vault to fit Bracket 2.");

    expect(patchBodies()).toEqual([]);
    await settle(1500);
    await act(async () => {});
    expect(patchBodies()).toEqual([{ goals: { v: 1, targetLevel: 2 } }]);
    expect(puts()).toBe(0);
    expect(posts()).toBe(0);
    expect(factsGets()).toHaveLength(1);
    expect(saveStatus()).toBe("saved");
  });

  it("answers and the target survive a reload: the deck GET's goals feed the read, the line and the sheet — loading is no edit", async () => {
    deckGoals = {
      v: 1,
      targetLevel: 2,
      exceptions: "One thematic Game Changer — ask me",
      answers: { rulesetVersion: 1, play: { quality: "yes" }, calls: { [EDGE_CALL]: "yes" } },
    };
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await lineIs("Your target: Bracket 2 · the cards and your answers say 4 · Why?");
    const dialog = await openSheet();
    const pressed = (group: HTMLElement) =>
      within(group)
        .getAllByRole("button")
        .filter((b) => b.getAttribute("aria-pressed") === "true")
        .map((b) => b.textContent);
    expect(pressed(within(dialog).getByRole("group", { name: "Your target" }))).toEqual(["2"]);
    const call = dialog.querySelector<HTMLElement>(`[data-question='${EDGE_CALL}']`)!;
    expect(pressed(within(call).getByRole("group"))).toEqual(["Yes"]);
    expect(
      (within(dialog).getByRole("textbox", { name: "Table exceptions" }) as HTMLInputElement).value,
    ).toBe("One thematic Game Changer — ask me");
    expect(within(dialog).getByRole("button", { name: /How it plays/ }).textContent).toContain(
      "1 answered",
    );
    await settle(1500);
    await act(async () => {});
    expect(patchBodies()).toEqual([]);
    expect(saveStatus()).toBe("saved");
  });

  it("an answer recorded under rulesetVersion 0 reads stale and still applies; Keep my answers PATCHes the restamp", async () => {
    deckGoals = { v: 1, answers: { rulesetVersion: 0, calls: { [EDGE_CALL]: "yes" } } };
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await lineIs(
      "Bracket 4 (Optimized) — from the cards and your answers · Rules changed since you answered · Why?",
    );
    const dialog = await openSheet();
    const notice = dialog.querySelector<HTMLElement>("[data-slot=bracket-stale]")!;
    expect(within(notice).getByText("Rules changed since you answered")).toBeTruthy();
    fireEvent.click(within(notice).getByRole("button", { name: "Keep my answers" }));
    expect(line()!.textContent).toBe(
      "Bracket 4 (Optimized) — from the cards and your answers · Why?",
    );
    await settle(1500);
    await act(async () => {});
    expect(patchBodies()).toEqual([
      { goals: { v: 1, answers: { rulesetVersion: 1, calls: { [EDGE_CALL]: "yes" } } } },
    ]);
  });

  it("answering a call is a goals PATCH too — and a burst of answers is one PATCH", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await lineIs("Bracket 3 or 4 — one card is your call · Why?");
    const dialog = await openSheet();
    const call = dialog.querySelector<HTMLElement>(`[data-question='${EDGE_CALL}']`)!;
    fireEvent.click(within(call).getByRole("button", { name: "Yes" }));
    fireEvent.click(within(call).getByRole("button", { name: "No" }));
    expect(line()!.textContent).toBe(
      "Bracket 3 (Upgraded) — from the cards and your answers · Why?",
    );
    await settle(1500);
    await act(async () => {});
    expect(patchBodies()).toEqual([
      { goals: { v: 1, answers: { rulesetVersion: 1, calls: { [EDGE_CALL]: "no" } } } },
    ]);
    expect(factsGets()).toHaveLength(1);
  });

  it("closing the tab inside the debounce sends the goals as ONE keepalive PATCH", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    await lineIs("Bracket 3 or 4 — one card is your call · Why?");
    const dialog = await openSheet();
    fireEvent.click(targetButton(dialog, "4"));
    window.dispatchEvent(new Event("pagehide"));
    const keepalive = fetchMock.mock.calls.filter(
      ([url, init]) => url === "/api/decks/deck-1" && (init as RequestInit).keepalive === true,
    );
    expect(keepalive).toHaveLength(1);
    expect(JSON.parse((keepalive[0][1] as RequestInit).body as string)).toEqual({
      goals: { v: 1, targetLevel: 4 },
    });
    await settle(1500);
    await act(async () => {});
    expect(patchBodies()).toHaveLength(1);
  });

  describe("in a draft — a target or an answer is a real edit (D5)", () => {
    function renderDraft() {
      stubViewport(1440);
      window.history.replaceState(null, "", "/decks/new?game=mtg&from=kozilek_c99");
      render(
        <DeckEditor
          deckId={null}
          draftGame="mtg"
          draftFormat="commander"
          draftFromSlug="kozilek_c99"
        />,
      );
    }

    it("a target set in a precon draft creates exactly ONE deck with the goals in its create — one POST + one PUT, no PATCH", async () => {
      renderDraft();
      await lineIs("Bracket 3 or 4 — one card is your call · Why?");
      await settle(1500);
      expect(posts()).toBe(0);
      expect(slot().hasAttribute("data-draft")).toBe(true);

      const dialog = await openSheet();
      fireEvent.click(targetButton(dialog, "3"));
      await settle(1500);
      await act(async () => {});
      expect(posts()).toBe(1);
      expect(createBody()).toMatchObject({
        name: "Eldrazi Unbound",
        goals: { v: 1, targetLevel: 3 },
      });
      expect(puts()).toBe(1);
      expect(patchBodies()).toEqual([]);
      expect(slot().hasAttribute("data-draft")).toBe(false);
      expect(saveStatus()).toBe("saved");
    });

    it("an answer is something to say too: one create carrying it", async () => {
      renderDraft();
      await lineIs("Bracket 3 or 4 — one card is your call · Why?");
      const dialog = await openSheet();
      fireEvent.click(within(dialog).getByRole("button", { name: "How it plays" }));
      fireEvent.click(
        within(within(dialog).getByRole("group", { name: "Theme first, over power?" })).getByRole(
          "button",
          { name: "No" },
        ),
      );
      await settle(1500);
      await act(async () => {});
      expect(posts()).toBe(1);
      expect(createBody().goals).toEqual({
        v: 1,
        answers: { rulesetVersion: 1, play: { theme: "no" } },
      });
      expect(puts()).toBe(1);
      expect(patchBodies()).toEqual([]);
    });

    describe("the target alone is something to say (isBlankDraft, LATER row 164's guard)", () => {
      /** A rolled Game Changer commander, the sheet open, then the commander cut inside the debounce. */
      async function targetThenCut(...targets: string[]) {
        stubViewport(1440);
        render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftSurprise />);
        await lineIs("Bracket: add 99 more cards · 1 Game Changer so far · Why?");
        const dialog = await openSheet();
        for (const t of targets) fireEvent.click(targetButton(dialog, t));
        // The list sits under the open modal: no settle between, so the debounce never fires first.
        fireEvent.click(
          within(section("Deck list")).getByRole("button", {
            name: "Remove Urza, Lord High Artificer",
            hidden: true,
          }),
        );
        await settle(1500);
        await act(async () => {});
      }

      it("set a target, cut the commander: the list is empty again but the target still mints ONE deck carrying it — no PUT, no PATCH", async () => {
        await targetThenCut("2");
        expect(posts()).toBe(1);
        expect(createBody().goals).toEqual({ v: 1, targetLevel: 2 });
        expect(puts()).toBe(0);
        expect(patchBodies()).toEqual([]);
      });

      it("set and cleared inside the debounce, then the commander cut: nothing to say — no row", async () => {
        await targetThenCut("2", "Not set");
        expect(posts()).toBe(0);
        expect(slot().hasAttribute("data-draft")).toBe(true);
      });
    });
  });

  describe("goals in Suggestions (Y6a)", () => {
    const solRec = {
      cardId: sol.id,
      name: sol.name,
      primaryType: "Artifact",
      costValue: 1,
      ciMask: 0,
      cheapestUsd: "1.20",
      popularity: 1,
      score: 0.9,
      confidence: "high",
      evidence: [
        {
          source: "edhrec_rank",
          why: "A Commander staple in EDHREC decklists",
          with: [],
          howOften: "EDHREC rank #1",
          confidence: "high",
        },
      ],
      conflicts: [],
    };
    function y6aRoute(input: RequestInfo | URL, init?: RequestInit) {
      const url = String(input);
      if (url.startsWith("/api/decks/deck-1/recommendations") || url === "/api/recommendations") {
        return ok({ count: 1, recommendations: [solRec], hidden: [], combosTruncated: false });
      }
      if (url === "/api/cards/resolve") {
        return ok({ results: [{ input: sol.name, match: sol, suggestions: [] }] });
      }
      return y4bRoute(input, init);
    }
    const suggestions = () => {
      fireEvent.click(screen.getByRole("tab", { name: "Suggestions" }));
      return pollFor(() => screen.queryByText("A Commander staple in EDHREC decklists"));
    };
    const goalsLine = () => document.querySelector<HTMLElement>("[data-slot=goals-line]");

    beforeEach(() => {
      fetchMock.mockImplementation(y6aRoute);
    });

    it("an add from Suggestions toasts Added X · Undo; Undo is a real edit — the card leaves and the deck saves again", async () => {
      stubViewport(1440);
      render(<DeckEditor deckId="deck-1" />);
      await lineIs("Bracket 3 or 4 — one card is your call · Why?");
      await suggestions();
      fireEvent.click(screen.getByRole("button", { name: "Add Sol Ring to the deck" }));
      const toastEl = (await pollFor(() => screen.queryByText("Added Sol Ring"))).closest(
        '[data-slot="toast"]',
      ) as HTMLElement;
      // The panel's live line says nothing: the toast already did.
      expect(screen.getAllByText("Added Sol Ring")).toHaveLength(1);
      await settle(1500);
      await act(async () => {});
      expect(puts()).toBe(1);
      expect(lastPutEntries().some((e) => e.cardId === sol.id)).toBe(true);

      fireEvent.click(within(toastEl).getByRole("button", { name: "Undo" }));
      expect(saveStatus()).toBe("dirty");
      await settle(1500);
      await act(async () => {});
      expect(puts()).toBe(2);
      expect(lastPutEntries().some((e) => e.cardId === sol.id)).toBe(false);
    });

    it("“Save as this deck's budget” is ONE goals PATCH — no PUT; the goals line says it, and the panel asks with it", async () => {
      deckGoals = { v: 1, targetLevel: 3 };
      stubViewport(1440);
      render(<DeckEditor deckId="deck-1" />);
      await lineIs("Your target: Bracket 3 · the cards say 3 or 4 — one card is your call · Why?");
      await suggestions();
      expect(goalsLine()!.textContent).toBe("Your goals: Bracket 3 (Upgraded) · Change");
      fireEvent.click(screen.getByRole("button", { name: "≤ $5 a card" }));
      fireEvent.click(screen.getByRole("button", { name: "Save as this deck's budget" }));
      expect(goalsLine()!.textContent).toBe(
        "Your goals: Bracket 3 (Upgraded) · ≤ $5 a card · Change",
      );
      await settle(1500);
      await act(async () => {});
      expect(patchBodies()).toEqual([
        { goals: { budget: { perCardUsd: 5 }, targetLevel: 3, v: 1 } },
      ]);
      expect(puts()).toBe(0);
      expect(posts()).toBe(0);
      // Once saved, the panel asks with the deck's new budget (the GET reads the goals off the row).
      await pollFor(() =>
        fetchMock.mock.calls.some(([url]) =>
          String(url).startsWith("/api/decks/deck-1/recommendations?budget=5"),
        )
          ? true
          : null,
      );
    });

    it("in a precon draft, saving a budget is a real edit like a target: ONE create carrying the goals, one PUT, no PATCH", async () => {
      stubViewport(1440);
      window.history.replaceState(null, "", "/decks/new?game=mtg&from=kozilek_c99");
      render(
        <DeckEditor
          deckId={null}
          draftGame="mtg"
          draftFormat="commander"
          draftFromSlug="kozilek_c99"
        />,
      );
      await lineIs("Bracket 3 or 4 — one card is your call · Why?");
      await suggestions();
      expect(posts()).toBe(0);
      fireEvent.click(screen.getByRole("button", { name: "≤ $1 a card" }));
      await settle(300);
      // The draft's own request carries the pick (no row yet).
      const draftAsks = fetchMock.mock.calls.filter(([url]) => url === "/api/recommendations");
      expect(JSON.parse((draftAsks.at(-1)![1] as RequestInit).body as string).budget).toBe(1);
      expect(posts()).toBe(0);

      fireEvent.click(screen.getByRole("button", { name: "Save as this deck's budget" }));
      await settle(1500);
      await act(async () => {});
      expect(posts()).toBe(1);
      expect(createBody()).toMatchObject({ goals: { v: 1, budget: { perCardUsd: 1 } } });
      expect(puts()).toBe(1);
      expect(patchBodies()).toEqual([]);
    });

    it("the goals line's “Set one” opens the Why sheet with focus on Your target — before the list has found anything (LATER row 175)", async () => {
      stubViewport(1440);
      render(<DeckEditor deckId="deck-1" />);
      await lineIs("Bracket 3 or 4 — one card is your call · Why?");
      await suggestions();
      expect(goalsLine()!.textContent).toBe("No bracket target yet · Set one");
      fireEvent.click(screen.getByRole("button", { name: "Set one" }));
      const dialog = await pollFor(sheet);
      await pollFor(() =>
        document.activeElement === targetButton(dialog, "Not set") ? true : null,
      );
      fireEvent.click(targetButton(dialog, "2"));
      expect(line()!.textContent).toBe(
        "Your target: Bracket 2 · the cards say 3 or 4 — one card is your call · Why?",
      );
      // Atop the sheet, the owner's goals line now reads the target too.
      expect(
        within(dialog).getByText("Your goals: Bracket 2 (Core)", { exact: false }),
      ).toBeTruthy();
    });

    it("LATER row 175: a commander alone has found nothing, so the line offers no Why? — the goals line is the door, and a target set there mints ONE deck carrying it", async () => {
      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith("/api/leaders/random")
          ? ok({ leader: kozilek })
          : y6aRoute(input, init),
      );
      stubViewport(1440);
      render(<DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftSurprise />);
      await lineIs("Bracket: add 99 more cards");
      expect(screen.queryByRole("button", { name: "Why?" })).toBeNull();
      await suggestions();
      expect(goalsLine()!.textContent).toBe("No bracket target yet · Set one");
      fireEvent.click(screen.getByRole("button", { name: "Set one" }));
      const dialog = await pollFor(sheet);
      fireEvent.click(targetButton(dialog, "2"));
      await settle(1500);
      await act(async () => {});
      expect(posts()).toBe(1);
      expect(createBody().goals).toEqual({ v: 1, targetLevel: 2 });
      expect(goalsLine()!.textContent).toBe("Your goals: Bracket 2 (Core) · Change");
    });

    it("on a phone the same door opens the Drawer with focus on Your target; the sheet's own Change brings it back", async () => {
      deckGoals = { v: 1, targetLevel: 3, budget: { perCardUsd: 5 } };
      stubViewport(375);
      render(<DeckEditor deckId="deck-1" />);
      await lineIs("Your target: Bracket 3 · the cards say 3 or 4 — one card is your call · Why?");
      fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
      await suggestions();
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
      const dialog = await pollFor(sheet);
      expect(dialog.getAttribute("data-slot")).toBe("drawer-popup");
      await pollFor(() => (document.activeElement === targetButton(dialog, "3") ? true : null));
      const sheetLine = dialog.querySelector<HTMLElement>("[data-slot=goals-line]")!;
      expect(sheetLine.textContent).toBe("Your goals: Bracket 3 (Upgraded) · ≤ $5 a card · Change");
      within(dialog).getByRole("button", { name: "Close" }).focus();
      fireEvent.click(within(sheetLine).getByRole("button", { name: "Change" }));
      expect(document.activeElement).toBe(targetButton(dialog, "3"));
    });
  });
});
