/**
 * The printings gallery (W5, WAVE2.md D4): the default renders pinned with
 * the LCP attributes intact; a click pins on md+ (URL + hero caption +
 * aria-live) and opens the drawer below md; One Piece rows carry no price
 * cells; Flip exists only with a back face; "Show all" fetches the capped
 * tail honestly; deep links restore (and unknown ones change nothing).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MD_QUERY } from "@/components/editor/use-tier";
import type { GalleryPrinting } from "@/lib/cards/printings";
import { PrintingsGallery, PrintingsHero, PrintingsTable } from "./printings-gallery";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function printing(n: number, over: Partial<GalleryPrinting> = {}): GalleryPrinting {
  return {
    id: uuid(n),
    setCode: `s${n}`,
    setName: `Set ${n}`,
    collectorNumber: String(n * 100),
    rarity: "rare",
    year: 2020,
    isDefault: false,
    hasBack: false,
    usd: null,
    usdFoil: null,
    ...over,
  };
}

const cmm = printing(1, {
  setCode: "cmm",
  setName: "Commander Masters",
  collectorNumber: "410",
  rarity: "uncommon",
  year: 2023,
  isDefault: true,
  usd: "2.89",
  usdFoil: "4.69",
});
const sld = printing(2, {
  setCode: "sld",
  setName: "Secret Lair Drop",
  collectorNumber: "2783",
  usdFoil: "129.95",
});
const dfc = printing(3, { setName: "Innistrad", hasBack: true });
const ROWS = [cmm, sld, dfc];

function stubWidth(px: number) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === MD_QUERY ? px >= 768 : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })),
  );
}

function renderGallery(over: Partial<Parameters<typeof PrintingsGallery>[0]> = {}) {
  return render(
    <PrintingsGallery
      cardId={uuid(99)}
      cardName="Sol Ring"
      gameCode="mtg"
      printings={ROWS}
      total={ROWS.length}
      {...over}
    >
      <PrintingsHero />
      <PrintingsTable />
    </PrintingsGallery>,
  );
}

const rowButton = (name: RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  window.history.replaceState(null, "", "/cards/abc");
  stubWidth(1200);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("initial render", () => {
  it("pins the default: pressed row, Shown marker, Default badge, LCP attributes", () => {
    renderGallery();
    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Commander Masters");
    expect(pressed[0].textContent).toContain("Shown");
    // Hero caption: set line, D4 caption with year, Default badge, no Reset.
    expect(screen.getByText("CMM · #410 · Unc. · 2023")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset to default" })).toBeNull();
    // The hero stays the LCP element: eager + fetchpriority, scryfall-derived src.
    const hero = document.querySelector('img[fetchpriority="high"]')!;
    expect(hero.getAttribute("loading")).toBe("eager");
    expect(hero.getAttribute("src")).toContain(`/normal/front/0/0/${cmm.id}.jpg`);
  });

  it("suppresses price columns for One Piece (P4.4 rule)", () => {
    renderGallery({ gameCode: "optcg" });
    expect(screen.queryByText("USD")).toBeNull();
    expect(screen.queryByText("Foil")).toBeNull();
    const firstRow = screen.getAllByRole("row")[1];
    expect(within(firstRow).getAllByRole("cell")).toHaveLength(3);
  });
});

describe("pinning on md+", () => {
  it("click → ?printing=, pressed row, hero caption, Reset, announcement; no history entry", async () => {
    renderGallery();
    const depth = window.history.length;
    fireEvent.click(rowButton(/Secret Lair Drop/));

    expect(window.location.search).toBe(`?printing=${sld.id}`);
    expect(window.history.length).toBe(depth);
    expect(rowButton(/Secret Lair Drop/).getAttribute("aria-pressed")).toBe("true");
    expect(rowButton(/Commander Masters/).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("SLD · #2783 · Rare · 2020")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeTruthy();
    // The hero swap is async (decode off-screen) — the polite line follows it.
    await screen.findByText("Showing Secret Lair Drop #2783");
  });

  it("Reset to default clears the param and re-pins the default", async () => {
    renderGallery();
    fireEvent.click(rowButton(/Secret Lair Drop/));
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(window.location.search).toBe("");
    expect(rowButton(/Commander Masters/).getAttribute("aria-pressed")).toBe("true");
    await screen.findByText("Showing Commander Masters #410");
  });

  it("Flip renders only with a back face and announces it", async () => {
    renderGallery();
    expect(screen.queryByRole("button", { name: /Flip/ })).toBeNull();
    fireEvent.click(rowButton(/Innistrad/));
    fireEvent.click(await screen.findByRole("button", { name: /Flip/ }));
    await screen.findByText("Showing Innistrad #300, back face");
  });
});

describe("phone", () => {
  it("tap opens the drawer with the printing large; the URL is untouched", async () => {
    stubWidth(375);
    renderGallery();
    fireEvent.click(rowButton(/Secret Lair Drop/));
    expect(window.location.search).toBe("");
    // Drawer content: title, caption line, honest price line (no USD → dash).
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Secret Lair Drop")).toBeTruthy();
    expect(within(dialog).getByText("SLD · #2783 · Rare · 2020")).toBeTruthy();
    expect(within(dialog).getByText("— · foil $129.95")).toBeTruthy();
    // The pinned row did not move (queried raw — the modal drawer makes the
    // page behind it inert, so role queries can't see the table).
    const pressed = document.querySelector('button[aria-pressed="true"]');
    expect(pressed?.textContent).toContain("Commander Masters");
  });
});

describe("the tail", () => {
  it("Show all fetches once, appends unseen rows, and the button goes away", async () => {
    const tail = [printing(4), printing(5), cmm];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ printings: tail, total: 5, truncated: false }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderGallery({ total: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Show all 5 printings" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6)); // header + 5
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/cards/${uuid(99)}/printings`);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("a truncated tail shows the honest cap note", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ printings: [printing(4)], total: 300, truncated: true }),
      })),
    );
    renderGallery({ total: 300 });
    fireEvent.click(screen.getByRole("button", { name: "Show all 300 printings" }));
    await screen.findByText("Showing 4 of 300 printings — newest first");
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("a failed fetch keeps the button usable and says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    renderGallery({ total: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Show all 5 printings" }));
    await screen.findByText("Couldn’t load — try again");
    expect(
      screen.getByRole("button", { name: "Show all 5 printings" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});

describe("filter", () => {
  it("appears only above 12 printings and filters by set name or code", () => {
    const { unmount } = renderGallery();
    expect(screen.queryByPlaceholderText("Filter sets…")).toBeNull();
    unmount();

    const many = [cmm, sld, ...Array.from({ length: 12 }, (_, i) => printing(i + 10))];
    renderGallery({ printings: many, total: many.length });
    const input = screen.getByPlaceholderText("Filter sets…");
    fireEvent.change(input, { target: { value: "secret" } });
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + the SLD row
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText(/No loaded sets match/)).toBeTruthy();
  });
});

describe("deep links", () => {
  it("?printing= present before mount pins that row", async () => {
    window.history.replaceState(null, "", `/cards/abc?printing=${sld.id}`);
    renderGallery();
    expect(rowButton(/Secret Lair Drop/).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeTruthy();
    await screen.findByText("Showing Secret Lair Drop #2783");
  });

  it("an id the card doesn't own fetches the tail once, then changes nothing", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ printings: ROWS, total: 3, truncated: false }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", `/cards/abc?printing=${uuid(77)}`);
    renderGallery();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Crafted-link stance: the default stays pinned, nothing swaps.
    expect(rowButton(/Commander Masters/).getAttribute("aria-pressed")).toBe("true");
    await act(async () => {}); // drain the resolve → no late re-pin either
    expect(rowButton(/Commander Masters/).getAttribute("aria-pressed")).toBe("true");
  });
});
