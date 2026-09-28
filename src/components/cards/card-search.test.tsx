/**
 * CardSearch (R6, REDESIGN.md §2 "Card search"): the filters in labelled
 * groups, the selected filters as removable chips with Clear all, the
 * skeleton grid while the first page is in flight (the same columns and
 * card aspect), the URL params landing preset from hub links, and Load
 * more keeping its own loading label. Fetch is stubbed; timers are fake
 * for the 250 ms debounce. X2: the Name box is the predictive island — a
 * `combobox` with the same accessible name — and a typed name sends
 * `sort=best`; the island's own behavior is name-suggest.test.tsx's.
 * X4a: the Set group (Magic only), its list fetched once — on the picker's
 * first press, or at mount for a preset `?set=` — and a chosen set's
 * requests, chip, header, "Most played" strip and `?printing=` tile links;
 * the picker's own behavior is set-picker.test.tsx's.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReleasedSet } from "@/lib/sets/lines";

import { CardSearch, MOST_PLAYED, SKELETON_CARDS } from "./card-search";

type Deferred = { resolve: (body: unknown) => void };
let requests: { url: string; deferred: Deferred }[] = [];

function stubFetch() {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      return new Promise<Response>((resolve, reject) => {
        const deferred: Deferred = {
          resolve: (body) => resolve(new Response(JSON.stringify(body), { status: 200 })),
        };
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
        requests.push({ url, deferred });
      });
    }),
  );
}

const results = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(from + i).padStart(12, "0")}`,
    name: `Card ${from + i}`,
    image: null,
  }));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  stubFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CardSearch — groups, chips, skeleton", () => {
  it("renders labelled filter groups and a skeleton grid until the first page lands", async () => {
    render(<CardSearch game="mtg" />);
    expect(screen.getByRole("group", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Type" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Color identity" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Set" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Set" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Traits" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Card name" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Card type" })).toBeTruthy();

    const skeleton = document.querySelector<HTMLElement>("[data-slot=results-skeleton]")!;
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.className).toContain("lg:grid-cols-5");
    const boxes = skeleton.querySelectorAll<HTMLElement>("[data-slot=skeleton]");
    expect(boxes).toHaveLength(SKELETON_CARDS);
    expect(boxes[0].style.aspectRatio).toBe("488 / 680");
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(document.querySelector("[data-slot=active-filters]")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/api/cards/search?game=mtg&limit=60");
    requests[0].deferred.resolve({ results: results(2), total: 2 });
    await flush();
    expect(document.querySelector("[data-slot=results-skeleton]")).toBeNull();
    expect(screen.getByText("2 cards")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("preset filters land as chips; removing one and Clear all re-search", async () => {
    render(
      <CardSearch
        game="optcg"
        initialName="luffy"
        initialType="Character"
        initialColors="within:RG"
        distinctField="traits"
        initialDistinct="Straw Hat Crew"
      />,
    );
    expect(screen.getByRole("group", { name: "Traits" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Set" })).toBeNull(); // One Piece declares no set field
    const row = screen.getByRole("list", { name: "Active filters" });
    const chips = within(row).getAllByRole("button");
    expect(chips.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Remove filter: Name luffy",
      "Remove filter: Type Character",
      "Remove filter: Color Red",
      "Remove filter: Color Green",
      "Remove filter: Trait Straw Hat Crew",
    ]);
    expect(screen.getByRole("button", { name: "Clear all" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    // X2 (REC-2): a typed name asks for the dropdown's order.
    expect(requests.at(-1)!.url).toBe(
      "/api/cards/search?game=optcg&limit=60&name=luffy&type=Character&color=within%3ARG&traits=Straw+Hat+Crew&sort=best",
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Color Red" }));
    expect(screen.queryByRole("button", { name: "Remove filter: Color Red" })).toBeNull();
    expect(screen.getByRole("button", { name: "Green" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Red" }).getAttribute("aria-pressed")).toBe("false");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(requests.at(-1)!.url).toContain("color=within%3AG");

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(document.querySelector("[data-slot=active-filters]")).toBeNull();
    expect((screen.getByRole("combobox", { name: "Card name" }) as HTMLInputElement).value).toBe(
      "",
    );
    act(() => {
      vi.advanceTimersByTime(250);
    });
    // One Piece without a name falls back to the honest name sort (P4.4).
    expect(requests.at(-1)!.url).toBe("/api/cards/search?game=optcg&limit=60&sort=name");
  });

  it("Load more keeps its own loading label and appends; a re-search keeps the results, not the skeleton", async () => {
    render(<CardSearch game="mtg" />);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    requests[0].deferred.resolve({ results: results(60), total: 61 });
    await flush();
    const more = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: "Loading…" })).toBeTruthy();
    expect(document.querySelector("[data-slot=results-skeleton]")).toBeNull();
    expect(requests.at(-1)!.url).toContain("offset=60");
    requests.at(-1)!.deferred.resolve({ results: results(1, 60), total: 61 });
    await flush();
    expect(screen.getAllByRole("link")).toHaveLength(61);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Card name" }), {
      target: { value: "sol" },
    });
    expect(screen.getByRole("button", { name: "Remove filter: Name sol" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(document.querySelector("[data-slot=results-skeleton]")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(61);
  });
});

const SETS: ReleasedSet[] = [
  {
    code: "blb",
    name: "Bloomburrow",
    releasedAt: "2024-08-02",
    setType: "expansion",
    group: "main",
    cards: 279,
    ordinal: 102,
  },
  {
    code: "pblb",
    name: "Bloomburrow Promos",
    releasedAt: "2024-08-02",
    setType: "promo",
    group: "other",
    cards: 40,
    ordinal: null,
  },
  {
    code: "emn",
    name: "Eldritch Moon",
    releasedAt: "2016-07-22",
    setType: "expansion",
    group: "main",
    cards: 208,
    ordinal: 71,
  },
];

/** Scoped rows: each carries its in-set printing (and a rank when given). */
const scopedResults = (n: number, ranks: (number | null)[] = []) =>
  results(n).map((card, i) => ({
    ...card,
    printingId: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
    popularity: ranks[i] ?? null,
  }));

const pending = (prefix: string) => requests.filter((r) => r.url.startsWith(prefix));
const lastUrl = (prefix: string) => pending(prefix).at(-1)?.url;

async function answer(prefix: string, body: unknown) {
  const request = pending(prefix).at(-1)!;
  request.deferred.resolve(body);
  await flush();
}

function debounce() {
  act(() => {
    vi.advanceTimersByTime(250);
  });
}

const setChip = () =>
  screen.queryByRole("button", { name: /^Remove filter: Set / })?.getAttribute("aria-label") ??
  null;

describe("CardSearch — the Set group (X4a)", () => {
  it("a preset ?set= fetches the list at mount, names the chip and the header, and asks for the grid in collector order and the strip by play", async () => {
    render(<CardSearch game="mtg" initialSet=" BLB " />);
    // The list goes out at mount (the chip and the header need the name)…
    expect(requests.map((r) => r.url)).toEqual(["/api/sets?game=mtg"]);
    expect(setChip()).toBe("Remove filter: Set BLB");
    debounce();
    // …then the grid and the strip, together, after the debounce.
    expect(requests.map((r) => r.url)).toEqual([
      "/api/sets?game=mtg",
      "/api/cards/search?game=mtg&limit=60&set=blb&sort=number",
      `/api/cards/search?game=mtg&limit=${MOST_PLAYED}&set=blb&sort=pop`,
    ]);
    await answer("/api/sets", { sets: SETS });
    expect(setChip()).toBe("Remove filter: Set Bloomburrow (BLB)");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Bloomburrow — the 102nd expansion set",
    );
    expect(document.querySelector("[data-slot=set-header] p")!.textContent).toBe(
      "BLB · Released Aug 2, 2024",
    );
    expect((screen.getByRole("combobox", { name: "Set" }) as HTMLInputElement).value).toBe(
      "Bloomburrow",
    );

    await answer("/api/cards/search?game=mtg&limit=60", { results: scopedResults(3), total: 279 });
    await answer(`/api/cards/search?game=mtg&limit=${MOST_PLAYED}`, {
      results: scopedResults(3, [46, 177, null]),
      total: 279,
    });
    const strip = screen.getByRole("region", { name: "Most played in Bloomburrow" });
    // Unranked cards are dropped: "most played" needs a rank to say so.
    const stripLinks = within(strip).getAllByRole("link");
    expect(stripLinks).toHaveLength(2);
    expect(stripLinks[0].getAttribute("href")).toBe(
      "/cards/00000000-0000-4000-8000-000000000000?printing=11111111-1111-4111-8111-000000000000",
    );
    expect(within(strip).getByText("Ranked by EDHREC play data via Scryfall.")).toBeTruthy();
    expect(screen.getByText("All 279 cards, in collector-number order")).toBeTruthy();
    const gridLinks = screen
      .getAllByRole("link")
      .filter((a) => !strip.contains(a))
      .map((a) => a.getAttribute("href"));
    expect(gridLinks).toHaveLength(3);
    expect(gridLinks.every((href) => /\?printing=11111111-/.test(href!))).toBe(true);
  });

  it("the picker's first press fetches the list once; a pick re-runs the grid at once; × and Clear all clear it", async () => {
    render(<CardSearch game="mtg" />);
    debounce();
    expect(requests.map((r) => r.url)).toEqual(["/api/cards/search?game=mtg&limit=60"]);
    await answer("/api/cards/search", { results: results(2), total: 2 });

    const setBox = screen.getByRole("combobox", { name: "Set" }) as HTMLInputElement;
    fireEvent.mouseDown(setBox, { button: 0 });
    await flush();
    expect(pending("/api/sets").map((r) => r.url)).toEqual(["/api/sets?game=mtg"]);
    await answer("/api/sets", { sets: SETS });
    fireEvent.input(setBox, { target: { value: "blo" }, inputType: "insertText" });
    const rows = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(rows.map((o) => o.querySelector("span span")!.textContent)).toEqual([
      "Bloomburrow",
      "Bloomburrow Promos",
    ]);
    fireEvent.click(rows[0]);
    expect(setChip()).toBe("Remove filter: Set Bloomburrow (BLB)");
    expect(setBox.value).toBe("Bloomburrow");
    debounce();
    expect(lastUrl("/api/cards/search?game=mtg&limit=60")).toBe(
      "/api/cards/search?game=mtg&limit=60&set=blb&sort=number",
    );
    expect(lastUrl(`/api/cards/search?game=mtg&limit=${MOST_PLAYED}`)).toBe(
      `/api/cards/search?game=mtg&limit=${MOST_PLAYED}&set=blb&sort=pop`,
    );
    // Opening the picker again costs nothing: the list is fetched once.
    fireEvent.mouseDown(setBox, { button: 0 });
    await flush();
    expect(pending("/api/sets")).toHaveLength(1);
    fireEvent.keyDown(setBox, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Set Bloomburrow (BLB)" }));
    expect(setChip()).toBeNull();
    expect(setBox.value).toBe("");
    expect(document.querySelector("[data-slot=set-header]")).toBeNull();
    debounce();
    expect(requests.at(-1)!.url).toBe("/api/cards/search?game=mtg&limit=60");

    fireEvent.mouseDown(setBox, { button: 0 });
    fireEvent.input(setBox, { target: { value: "eld" }, inputType: "insertText" });
    fireEvent.click(within(screen.getByRole("listbox")).getAllByRole("option")[0]);
    expect(setChip()).toBe("Remove filter: Set Eldritch Moon (EMN)");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(setChip()).toBeNull();
    debounce();
    expect(requests.at(-1)!.url).toBe("/api/cards/search?game=mtg&limit=60");
  });

  it("a set and a name: the dropdown's order inside the set, and no strip", async () => {
    render(<CardSearch game="mtg" initialSet="blb" initialName="for" />);
    debounce();
    expect(pending("/api/cards/search").map((r) => r.url)).toEqual([
      "/api/cards/search?game=mtg&limit=60&name=for&set=blb&sort=best",
    ]);
    await answer("/api/sets", { sets: SETS });
    await answer("/api/cards/search", { results: scopedResults(2), total: 2 });
    expect(screen.queryByRole("region", { name: /Most played/ })).toBeNull();
    expect(screen.getByText("2 cards")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Bloomburrow — the 102nd expansion set",
    );
  });

  it(`no strip when the whole list fits in ${MOST_PLAYED}, or when nothing in it is ranked`, async () => {
    render(<CardSearch game="mtg" initialSet="blb" initialType="Land" />);
    debounce();
    await answer("/api/sets", { sets: SETS });
    await answer("/api/cards/search?game=mtg&limit=60", { results: scopedResults(5), total: 5 });
    await answer(`/api/cards/search?game=mtg&limit=${MOST_PLAYED}`, {
      results: scopedResults(5, [1, 2, 3, 4, 5]),
      total: 5,
    });
    expect(screen.queryByRole("region", { name: /Most played/ })).toBeNull();
    // With another filter the count is not "All".
    expect(screen.getByText("5 cards, in collector-number order")).toBeTruthy();
  });

  it("an unknown or unreleased preset code: the chip keeps the code, and the header says no released set has it", async () => {
    render(<CardSearch game="mtg" initialSet="zzz" />);
    debounce();
    await answer("/api/sets", { sets: SETS });
    await answer("/api/cards/search?game=mtg&limit=60", { results: [], total: 0 });
    expect(setChip()).toBe("Remove filter: Set ZZZ");
    expect(document.querySelector("[data-slot=set-header]")!.textContent).toBe(
      "No released set has the code “ZZZ”.",
    );
    expect(screen.getByText("0 cards")).toBeTruthy();
  });

  it("One Piece ignores a preset set: no group, no chip, no list, the request unchanged", async () => {
    render(<CardSearch game="optcg" initialSet="op01" />);
    debounce();
    expect(requests.map((r) => r.url)).toEqual(["/api/cards/search?game=optcg&limit=60&sort=name"]);
    expect(setChip()).toBeNull();
  });
});
