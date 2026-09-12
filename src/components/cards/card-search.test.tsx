/**
 * CardSearch (R6, REDESIGN.md §2 "Card search"): the filters in labelled
 * groups, the selected filters as removable chips with Clear all, the
 * skeleton grid while the first page is in flight (the same columns and
 * card aspect), the URL params landing preset from hub links, and Load
 * more keeping its own loading label. Fetch is stubbed; timers are fake
 * for the 250 ms debounce.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardSearch, SKELETON_CARDS } from "./card-search";

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
    expect(screen.queryByRole("group", { name: "Traits" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Card name" })).toBeTruthy();
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
    expect(requests.at(-1)!.url).toBe(
      "/api/cards/search?game=optcg&limit=60&name=luffy&type=Character&color=within%3ARG&traits=Straw+Hat+Crew",
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
    expect((screen.getByRole("searchbox", { name: "Card name" }) as HTMLInputElement).value).toBe(
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

    fireEvent.change(screen.getByRole("searchbox", { name: "Card name" }), {
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
