/**
 * The share page's artwork header (R5b — G3 / F5 / F12): the band with the
 * resolved crop and its visible credit (or the gradient alone), the name at
 * the page-title step, the leaders line through the adapter (partners in
 * `leaderIds` order), author link, format · count, the Warden legality
 * line inside the header, the actions in their pinned order; Copy decklist
 * confirming with a check that resets (and saying so when the clipboard
 * refuses); the leader card's accent ring; the hover / focus preview on a
 * card name that still navigates on click.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { artCredit, type CardArt } from "@/lib/cards/art";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { atraxa, card, thrasios, tymna } from "@/lib/games/mtg/test-fixtures";
import type { CardData } from "@/lib/games/types";
import {
  COPY_RESET_MS,
  DeckShareView,
  type ShareDeckCard,
  type ShareDeckMeta,
} from "./deck-share-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const commanderZone = COMMANDER.zones.find((z) => z.isLeaderZone)!.id;
const mainZone = COMMANDER.zones.find((z) => !z.isLeaderZone)!.id;

const SOL_RING_IMAGE = "https://cards.scryfall.io/normal/front/8/3/83f43730.jpg";

const ART: CardArt = {
  url: "https://cards.scryfall.io/art_crop/front/2/0/20e44330.jpg",
  layout: "art_crop",
  artist: "Victor Adame Minguez",
  credit: artCredit("Victor Adame Minguez"),
};

const solRing = card({ name: "Sol Ring", primaryType: "Artifact", costValue: 1 });
// 98 more colorless singletons: with Sol Ring and the commander, exactly 100.
const filler = Array.from({ length: 98 }, (_, i) =>
  card({ name: `Filler ${i + 1}`, primaryType: "Artifact", costValue: 2 }),
);

function wire(c: CardData, zone: string, image: string | null = null): ShareDeckCard {
  return { cardId: c.id, zone, qty: 1, tags: [], printingId: null, card: { ...c, image } };
}

const deck: ShareDeckMeta = {
  id: "0d7b2b7d-2f2c-4d1c-9c8f-4b2a8f9f2e11",
  publicId: "uwvrnv2pv4t6",
  game: "mtg",
  format: "commander",
  name: "Atraxa Superfriends",
  description: null,
  notes: null,
  visibility: "public",
  likesCount: 0,
  updatedAt: "2026-09-09T04:13:26.820Z",
  leaderIds: [atraxa.id],
  ciMask: atraxa.ciMask,
};

const cards: ShareDeckCard[] = [
  wire(atraxa, commanderZone),
  wire(solRing, mainZone, SOL_RING_IMAGE),
  ...filler.map((c) => wire(c, mainZone)),
];

const author = { name: "Bobandis6", username: "bobandis6" };

const band = () => document.querySelector<HTMLElement>("header [data-slot=surface-header]");

afterEach(() => {
  vi.useRealTimers();
  push.mockReset();
});

describe("DeckShareView — the artwork header", () => {
  it("band with the crop and its visible credit, title, leaders, author, format · count, the Warden line, the actions in order", () => {
    render(<DeckShareView deck={deck} cards={cards} author={author} art={ART} />);
    const header = screen.getByRole("banner");

    expect(band()?.dataset.banner).toBe("art_crop");
    expect(band()?.querySelector("img")?.getAttribute("src")).toBe(ART.url);
    expect(band()?.querySelector("[data-slot=art-credit]")?.textContent).toBe(ART.credit);

    const h1 = within(header).getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Atraxa Superfriends");
    expect(h1.className).toContain("text-3xl");
    expect(h1.className).toContain("break-words");

    expect(header.querySelector("[data-slot=leader-line]")?.textContent).toBe(
      "Commander Atraxa, Praetors' Voice · 4/4",
    );
    expect(within(header).getByRole("link", { name: "Bobandis6" }).getAttribute("href")).toBe(
      "/u/bobandis6",
    );
    expect(header.textContent).toContain("Commander · 100 / 100 cards · Updated Sep 9, 2026");

    // Two live regions sit in the header (the Warden line and the Copy slot);
    // the legality line is the one carrying the format title.
    const status = within(header).getByTitle("Legal Commander deck");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("The Warden approves this deck ✓");

    const actions = [
      ...header.querySelectorAll<HTMLElement>("a[data-slot=button], button[data-slot=button]"),
    ].map((el) => el.textContent);
    expect(actions).toEqual(["♡ Like", "Bookmark", "Fork", "Copy decklist"]);
  });

  it("without art (One Piece, the private gate): the gradient band and no credit anywhere in the header", () => {
    render(<DeckShareView deck={deck} cards={cards} author={author} art={null} />);
    expect(band()?.dataset.banner).toBe("gradient");
    expect(band()?.querySelector("img")).toBeNull();
    expect(screen.getByRole("banner").querySelector("[data-slot=art-credit]")).toBeNull();
  });

  it("a partner deck names both leaders in leaderIds order", () => {
    const partners: ShareDeckMeta = {
      ...deck,
      name: "Tymna & Thrasios",
      leaderIds: [tymna.id, thrasios.id],
      ciMask: tymna.ciMask | thrasios.ciMask,
    };
    // The wire sorts a zone by name (Thrasios before Tymna); leaderIds wins.
    render(
      <DeckShareView
        deck={partners}
        cards={[wire(thrasios, commanderZone), wire(tymna, commanderZone), wire(solRing, mainZone)]}
      />,
    );
    expect(document.querySelector("[data-slot=leader-line]")?.textContent).toBe(
      "Commander Tymna the Weaver & Thrasios, Triton Hero",
    );
  });
});

describe("DeckShareView — F12", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();
  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("Copy decklist writes the list, shows the check with 'Copied' as a status, and resets", async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue(undefined);
    render(<DeckShareView deck={deck} cards={cards} />);
    const status = document.querySelector<HTMLElement>("[data-slot=copy-status]")!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Copy decklist" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("Sol Ring");
    expect(status.textContent).toBe("Copied");
    const check = status.firstElementChild!;
    expect(check.className).toContain("motion-safe:animate-in");
    expect(check.className).toContain("motion-safe:zoom-in-50");
    expect(check.querySelector("svg")).toBeTruthy();
    // The button keeps its name throughout.
    expect(screen.getByRole("button", { name: "Copy decklist" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(COPY_RESET_MS);
    });
    expect(status.textContent).toBe("");
  });

  it("a refused clipboard write says 'Copy failed' in the same slot", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<DeckShareView deck={deck} cards={cards} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy decklist" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector("[data-slot=copy-status]")?.textContent).toBe("Copy failed");
  });

  it("the leader card carries the accent ring (read-only leader zone)", () => {
    render(<DeckShareView deck={deck} cards={cards} />);
    const leader = screen.getByRole("button", { name: "Show Atraxa, Praetors' Voice" });
    expect(leader.className).toContain("ring-accent-game");
    expect(leader.className).toContain("ring-2");
  });
});

describe("DeckShareView — F5 previews", () => {
  it("focusing a card name opens the card's image preview; blur closes it; click still navigates", () => {
    vi.useFakeTimers();
    render(<DeckShareView deck={deck} cards={cards} />);
    const name = screen.getByRole("button", { name: "Sol Ring" });
    expect(name.tagName).toBe("BUTTON");
    expect(name.dataset.slot).toBe("hover-card-trigger");

    act(() => {
      name.focus();
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const popup = document.querySelector<HTMLElement>("[data-slot=hover-card-content]");
    expect(popup).toBeTruthy();
    const img = popup!.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(SOL_RING_IMAGE);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("width")).toBe("488");
    expect(img.getAttribute("height")).toBe("680");
    expect(popup!.textContent).toBe("Sol Ring");
    expect(name.hasAttribute("data-popup-open")).toBe(true);

    act(() => {
      name.blur();
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(name.hasAttribute("data-popup-open")).toBe(false);

    fireEvent.click(name);
    expect(push).toHaveBeenCalledWith(`/cards/${solRing.id}`);
  });
});
