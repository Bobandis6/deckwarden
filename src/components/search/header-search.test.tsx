/**
 * HeaderSearch (HEADER-SEARCH): the card search in the site header. Fetch is
 * stubbed per request, as in name-suggest.test.tsx (a test decides when and
 * how each answers); timers are fake for the 150 ms debounce only, so Base
 * UI's frames stay real. The page's game comes from a `<main id="main">`
 * rendered beside the island, the path from a mocked usePathname. jsdom has
 * no CSS and no implicit submission: the phone's row is pinned by its state
 * (the attribute the header's `:has` rule reads, the classes), focus by
 * `document.activeElement` read with no await in between, and a submit by
 * the FormData a `submit` listener sees.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SuggestRow } from "@/lib/search/suggest";

const nav = vi.hoisted(() => ({ pathname: "/" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { HeaderSearch, isEditorPath, pageGame } from "./header-search";
import { SUGGEST_DEBOUNCE_MS } from "./name-suggest";

interface Pending {
  url: URL;
  answer: (rows: SuggestRow[]) => void;
  fail: () => void;
}
let pending: Pending[] = [];

beforeEach(() => {
  pending = [];
  nav.pathname = "/";
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
        pending.push({
          url,
          answer: (rows) =>
            resolve(
              new Response(JSON.stringify({ q: url.searchParams.get("q"), results: rows }), {
                status: 200,
              }),
            ),
          fail: () => resolve(new Response("{}", { status: 500 })),
        });
      });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function row(name: string, extra: Partial<SuggestRow> = {}): SuggestRow {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `id-${slug}`,
    name,
    slug: null,
    isLeader: false,
    typeLine: "Artifact",
    colorsMask: 0,
    ciMask: 0,
    externalKey: `key-${slug}`,
    image: null,
    ...extra,
  };
}

const SOL_RING = row("Sol Ring");
const LUFFY = row("Monkey.D.Luffy", { typeLine: "Leader — Straw Hat Crew" });
const LUFFY_2 = row("Monkey.D.Luffy (Gear 5)", { typeLine: "Character — Straw Hat Crew" });

/** The island, and the page beside it: `<main id="main">` with the page's game, if any. */
function renderOn(pathname: string, game?: "mtg" | "optcg") {
  nav.pathname = pathname;
  const utils = render(
    <>
      <HeaderSearch />
      <main id="main" data-game={game}>
        <input aria-label="Page field" />
        <div role="dialog" aria-label="A dialog">
          <button type="button">Inside the dialog</button>
        </div>
        <div role="menu" aria-label="A menu">
          <button type="button">Inside the menu</button>
        </div>
      </main>
    </>,
  );
  const form = screen.getByRole("search", { name: "Cards" }) as HTMLFormElement;
  const input = screen.getByRole("combobox", { name: "Search cards" }) as HTMLInputElement;
  const searchButton = screen.getByRole("button", { name: "Search cards" });
  return { ...utils, form, input, searchButton };
}

function typeText(input: HTMLElement, value: string) {
  fireEvent.input(input, { target: { value }, inputType: "insertText" });
}

/** Past the debounce: the request goes out. */
async function debounce() {
  await act(async () => {
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS);
  });
}

/** Let an answer's promise chain (and a second ask behind it) run out. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function answer(rows: SuggestRow[], which = pending.at(-1)!) {
  await act(async () => {
    which.answer(rows);
  });
  await flush();
}

const listbox = () => screen.queryByRole("listbox");
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");
const params = (p: Pending) => Object.fromEntries(p.url.searchParams);

/** What the form would send: FormData seen by a `submit` listener (jsdom cannot navigate). */
function captureSubmits(form: HTMLFormElement) {
  const sent: Record<string, FormDataEntryValue>[] = [];
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sent.push(Object.fromEntries(new FormData(form)));
  });
  return sent;
}

describe("HeaderSearch: the form", () => {
  it("is one search landmark named Cards around one combobox named Search cards: a GET form to /cards with q", () => {
    const { form, input } = renderOn("/");
    expect(screen.getAllByRole("search")).toHaveLength(1);
    expect(form.tagName).toBe("FORM");
    expect(form.getAttribute("action")).toBe("/cards");
    expect(form.getAttribute("method")).toBe("get");
    expect(input.form).toBe(form);
    expect(input.name).toBe("q");
    expect(input.type).toBe("search");
    expect(input.placeholder).toBe("Search cards…");
    // Magic is /cards' own default: no game param until One Piece is the game.
    expect(form.querySelector('input[name="game"]')).toBeNull();
    // NameSuggest's default button: Enter submits though Base UI adds a second text field.
    expect(form.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  });

  it("asks nothing on render or on focus; two typed letters ask for every Magic card", async () => {
    const { input } = renderOn("/");
    await debounce();
    act(() => input.focus());
    await debounce();
    expect(pending).toHaveLength(0);
    typeText(input, "s");
    await debounce();
    expect(pending).toHaveLength(0);
    typeText(input, "so");
    await debounce();
    expect(pending).toHaveLength(1);
    expect(pending[0].url.pathname).toBe("/api/cards/suggest");
    expect(params(pending[0])).toEqual({ game: "mtg", scope: "cards", q: "so" });
  });

  it("rows open card pages with the type line as their detail; Enter with nothing highlighted is left to the browser", async () => {
    const { input, form } = renderOn("/");
    typeText(input, "sol");
    await debounce();
    await answer([SOL_RING]);
    const [first, footer] = options();
    expect(first.tagName).toBe("A");
    expect(first.getAttribute("href")).toBe("/cards/id-sol-ring");
    expect(within(first).getByText("Artifact")).toBeTruthy();
    expect(footer.textContent).toBe("Show every card matching “sol”↵");
    expect(screen.getByRole("status").textContent).toBe("1 suggestion");
    const notPrevented = fireEvent.keyDown(input, { key: "Enter" });
    expect(notPrevented).toBe(true); // the browser submits the form: /cards?q=sol
    expect(listbox()).toBeNull();
    expect(Object.fromEntries(new FormData(form))).toEqual({ q: "sol" });
  });

  it("the footer row submits the typed text to /cards", async () => {
    const { input, form } = renderOn("/");
    const sent = captureSubmits(form);
    typeText(input, "Sol R");
    await debounce();
    await answer([SOL_RING]);
    fireEvent.click(options().at(-1)!);
    expect(sent).toEqual([{ q: "Sol R" }]);
  });

  it("server render: one shape, whatever the page — the form, q, the default button, no game param, the row shut", () => {
    nav.pathname = "/leaders";
    const html = renderToString(<HeaderSearch />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const forms = doc.querySelectorAll('form[role="search"]');
    expect(forms).toHaveLength(1);
    const form = forms[0];
    expect(form.getAttribute("aria-label")).toBe("Cards");
    expect(form.getAttribute("action")).toBe("/cards");
    expect(form.getAttribute("method")).toBe("get");
    expect(form.hasAttribute("data-search-open")).toBe(false);
    const named = form.querySelectorAll("input[name]");
    expect([...named].map((i) => [i.getAttribute("name"), i.getAttribute("value")])).toEqual([
      ["q", ""],
    ]);
    expect(form.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(form.querySelector('[data-slot="header-search-hint"]')?.textContent).toBe("/");
    const button = doc.querySelector('button[aria-label="Search cards"]');
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(button?.getAttribute("aria-controls")).toBe(form.id);
  });
});

describe("HeaderSearch: the game", () => {
  it("a One Piece page searches One Piece, and the form carries game=optcg", async () => {
    const { input, form } = renderOn("/leaders", "optcg");
    expect(form.querySelector('input[name="game"]')).toBeNull(); // read on focus, not at render
    act(() => input.focus());
    expect(form.querySelector('input[name="game"]')?.getAttribute("value")).toBe("optcg");
    typeText(input, "luf");
    await debounce();
    expect(params(pending[0])).toEqual({ game: "optcg", scope: "cards", q: "luf" });
    await answer([LUFFY]);
    expect(Object.fromEntries(new FormData(form))).toEqual({ q: "luf", game: "optcg" });
    expect(options()[0].getAttribute("href")).toBe("/cards/id-monkey-d-luffy");
  });

  it("a Magic miss asks One Piece once and shows its rows under a line naming both games; Enter and the footer follow One Piece", async () => {
    const { input, form } = renderOn("/commanders", "mtg");
    const sent = captureSubmits(form);
    typeText(input, "luffy");
    await debounce();
    expect(pending).toHaveLength(1);
    expect(params(pending[0])).toEqual({ game: "mtg", scope: "cards", q: "luffy" });
    await answer([], pending[0]);
    expect(pending).toHaveLength(2); // one extra request, only on the miss
    expect(params(pending[1])).toEqual({ game: "optcg", scope: "cards", q: "luffy" });
    await answer([LUFFY, LUFFY_2], pending[1]);

    const line = "No Magic cards match. 2 One Piece cards.";
    expect(screen.getByRole("status").textContent).toBe(line);
    const popup = document.querySelector<HTMLElement>('[data-slot="name-suggest-popup"]')!;
    expect(within(popup).getByText(line).tagName).toBe("P");
    expect(options().map((o) => o.getAttribute("href"))).toEqual([
      "/cards/id-monkey-d-luffy",
      "/cards/id-monkey-d-luffy-gear-5-",
      null, // the footer
    ]);
    expect(Object.fromEntries(new FormData(form))).toEqual({ q: "luffy", game: "optcg" });
    fireEvent.click(options().at(-1)!);
    expect(sent).toEqual([{ q: "luffy", game: "optcg" }]);
    expect(pending).toHaveLength(2);

    // A Magic name again: Magic answers, the form follows it, no second ask.
    typeText(input, "sol");
    // Until "sol" is answered the form follows the page's game, not luffy's.
    expect(form.querySelector('input[name="game"]')).toBeNull();
    await debounce();
    await answer([SOL_RING], pending[2]);
    expect(pending).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toBe("1 suggestion");
    expect(form.querySelector('[data-slot="name-suggest-note"]')).toBeNull();
    expect(Object.fromEntries(new FormData(form))).toEqual({ q: "sol" });
  });

  it("a One Piece miss asks Magic the same way", async () => {
    const { input, form } = renderOn("/l/op01-001", "optcg");
    typeText(input, "sol ring");
    await debounce();
    await answer([], pending[0]);
    expect(params(pending[1])).toEqual({ game: "mtg", scope: "cards", q: "sol ring" });
    await answer([SOL_RING], pending[1]);
    expect(screen.getByRole("status").textContent).toBe("No One Piece cards match. 1 Magic card.");
    expect(Object.fromEntries(new FormData(form))).toEqual({ q: "sol ring" });
  });

  it("both games miss: one quiet No matches, two requests, the page's game kept", async () => {
    const { input, form } = renderOn("/cards", "mtg");
    typeText(input, "zzq");
    await debounce();
    await answer([], pending[0]);
    await answer([], pending[1]);
    expect(pending).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe("No matches");
    expect(form.querySelector('[data-slot="name-suggest-note"]')).toBeNull();
    expect(Object.fromEntries(new FormData(form))).toEqual({ q: "zzq" });
  });

  it("a failed second ask leaves the first game's miss standing", async () => {
    const { input } = renderOn("/", "mtg");
    typeText(input, "zzq");
    await debounce();
    await answer([], pending[0]);
    await act(async () => {
      pending[1].fail();
    });
    await flush();
    expect(screen.getByRole("status").textContent).toBe("No matches");
    expect(options().map((o) => o.textContent)).toEqual(["Show every card matching “zzq”↵"]);
  });

  it("the game is read when the reader types, so the same text asks again on another game's page", async () => {
    const { input, rerender } = renderOn("/commanders", "mtg");
    typeText(input, "sol");
    await debounce();
    await answer([SOL_RING], pending[0]);
    // A client navigation to a One Piece page: the header stays mounted, the page changes.
    nav.pathname = "/leaders";
    rerender(
      <>
        <HeaderSearch />
        <main id="main" data-game="optcg" />
      </>,
    );
    typeText(input, "sol ");
    await debounce();
    expect(pending).toHaveLength(2);
    expect(params(pending[1])).toEqual({ game: "optcg", scope: "cards", q: "sol" });
  });
});

describe("pageGame / isEditorPath", () => {
  function page(html: string) {
    document.body.innerHTML = html;
  }
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads data-game on #main or an ancestor of it, never an element inside it (a deck tile on /account)", () => {
    page('<main id="main" data-game="optcg"><div data-game="mtg"></div></main>');
    expect(pageGame()).toBe("optcg");
    page('<div data-game="optcg"><main id="main"><div data-game="mtg"></div></main></div>');
    expect(pageGame()).toBe("optcg");
    page('<main id="main"><section><div data-game="optcg"></div></section></main>');
    expect(pageGame()).toBeNull();
  });

  it("no #main, no mark, or a game without an adapter: null (the box searches Magic)", () => {
    page("<div></div>");
    expect(pageGame()).toBeNull();
    page('<main id="main"><p>Privacy</p></main>');
    expect(pageGame()).toBeNull();
    page('<main id="main" data-game="azuki"></main>');
    expect(pageGame()).toBeNull();
  });

  it("the editor routes are /decks and below", () => {
    expect(isEditorPath("/decks/new")).toBe(true);
    expect(isEditorPath("/decks/abc12345/edit")).toBe(true);
    expect(isEditorPath("/decks")).toBe(true);
    expect(isEditorPath("/d/abc12345")).toBe(false);
    expect(isEditorPath("/deckster")).toBe(false);
    expect(isEditorPath("/")).toBe(false);
    expect(isEditorPath(null)).toBe(false);
  });
});

describe("HeaderSearch: the / key", () => {
  it("off the editor, / jumps to the box and selects its text, and the slash is not typed", () => {
    const { input } = renderOn("/c/atraxa-praetors-voice");
    fireEvent.input(input, { target: { value: "sol" }, inputType: "insertText" });
    input.blur();
    const select = vi.spyOn(input, "select");
    const notPrevented = fireEvent.keyDown(document.body, { key: "/" });
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(select).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-slot="header-search-hint"]')?.textContent).toBe("/");
  });

  it.each(["/decks/new", "/decks/abc12345/edit"])(
    "on %s the editor owns /: the box stays put, the key is left alone, and there is no keycap",
    (pathname) => {
      const { input } = renderOn(pathname);
      const notPrevented = fireEvent.keyDown(document.body, { key: "/" });
      expect(notPrevented).toBe(true);
      expect(document.activeElement).not.toBe(input);
      expect(document.querySelector('[data-slot="header-search-hint"]')).toBeNull();
    },
  );

  it("not with a modifier, not while typing in a field, not inside an open dialog or menu", () => {
    const { input } = renderOn("/");
    for (const modifier of ["ctrlKey", "metaKey", "altKey"]) {
      fireEvent.keyDown(document.body, { key: "/", [modifier]: true });
      expect(document.activeElement).not.toBe(input);
    }
    const field = screen.getByRole("textbox", { name: "Page field" });
    field.focus();
    expect(fireEvent.keyDown(field, { key: "/" })).toBe(true);
    expect(document.activeElement).toBe(field);
    for (const name of ["Inside the dialog", "Inside the menu"]) {
      const inside = screen.getByRole("button", { name });
      inside.focus();
      expect(fireEvent.keyDown(inside, { key: "/" })).toBe(true);
      expect(document.activeElement).toBe(inside);
    }
  });

  it("on a phone-width window, / opens the search row first", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { input, form } = renderOn("/");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(form.hasAttribute("data-search-open")).toBe(true);
    expect(document.activeElement).toBe(input);
  });
});

describe("HeaderSearch: the phone's search row", () => {
  it("the tap opens the row over the header and focuses its input inside the same tap", () => {
    const { input, form, searchButton } = renderOn("/");
    expect(form.hasAttribute("data-search-open")).toBe(false);
    expect(form.className).toContain("hidden");
    expect(searchButton.getAttribute("aria-expanded")).toBe("false");
    let openAtFocus: boolean | null = null;
    input.addEventListener("focus", () => {
      openAtFocus = form.hasAttribute("data-search-open");
    });
    fireEvent.click(searchButton);
    // No await: focus landed inside the click, after the open was committed (flushSync).
    expect(document.activeElement).toBe(input);
    expect(openAtFocus).toBe(true);
    expect(form.className).toContain("absolute inset-0");
    expect(searchButton.getAttribute("aria-expanded")).toBe("true");
    expect(searchButton.className).toContain("invisible");
  });

  it("Close shuts the row, keeps the text, and returns focus to the search button", () => {
    const { input, form, searchButton } = renderOn("/");
    fireEvent.click(searchButton);
    typeText(input, "sol");
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(form.hasAttribute("data-search-open")).toBe(false);
    expect(document.activeElement).toBe(searchButton);
    expect(input.value).toBe("sol");
  });

  it("Esc with the popup open closes the popup only; Esc with it shut closes the row, keeps the text, and returns focus", async () => {
    const { input, form, searchButton } = renderOn("/");
    fireEvent.click(searchButton);
    typeText(input, "sol");
    await debounce();
    await answer([SOL_RING]);
    expect(listbox()).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(listbox()).toBeNull();
    expect(form.hasAttribute("data-search-open")).toBe(true);
    expect(document.activeElement).toBe(input);

    const notPrevented = fireEvent.keyDown(input, { key: "Escape" });
    expect(notPrevented).toBe(false); // nor does the search input's native Esc-clear run
    expect(form.hasAttribute("data-search-open")).toBe(false);
    expect(document.activeElement).toBe(searchButton);
    expect(input.value).toBe("sol");
  });

  it("a route change closes the row and focus returns to the search button", () => {
    const { input, form, searchButton, rerender } = renderOn("/");
    fireEvent.click(searchButton);
    expect(document.activeElement).toBe(input);
    nav.pathname = "/cards/id-sol-ring";
    rerender(
      <>
        <HeaderSearch />
        <main id="main" data-game="mtg" />
      </>,
    );
    expect(form.hasAttribute("data-search-open")).toBe(false);
    expect(document.activeElement).toBe(searchButton);
  });

  it("a route change with the row shut moves nothing", () => {
    const { searchButton, rerender } = renderOn("/");
    const field = screen.getByRole("textbox", { name: "Page field" });
    field.focus();
    nav.pathname = "/sets";
    rerender(
      <>
        <HeaderSearch />
        <main id="main">
          <input aria-label="Page field" />
        </main>
      </>,
    );
    expect(document.activeElement).not.toBe(searchButton);
  });
});
