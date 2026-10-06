/**
 * The share page's artwork header (R5b — G3 / F5 / F12): the band with the
 * resolved crop and its visible credit (or the gradient alone), the name at
 * the page-title step, the leaders line through the adapter (partners in
 * `leaderIds` order), author link, format · count, the Warden legality
 * line inside the header, the actions in their pinned order; Copy decklist
 * confirming with a check that resets (and saying so when the clipboard
 * refuses); the leader card's accent ring; the hover / focus preview on a
 * card name that still navigates on click. X1: the signed-out Like,
 * Bookmark and Fork prompts carry the way back to this deck.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { factsIds, factsPath } from "@/lib/brackets/facts";
import { tableBracket } from "@/lib/brackets/table";
import { toEditorCard } from "@/lib/decks/editor-state";
import { getAdapter } from "@/lib/games/registry";
import { massEntryUrl } from "@/lib/buy/links";
import { artCredit, type CardArt } from "@/lib/cards/art";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { atraxa, card, thrasios, tymna } from "@/lib/games/mtg/test-fixtures";
import type { DeckGoals } from "@/lib/decks/goals";
import { setDeckToken } from "@/lib/decks/token-store";
import type { BracketFreshness, CardData, CompleteCombo } from "@/lib/games/types";
import {
  COPY_RESET_MS,
  DeckShareView,
  type ShareBracketFacts,
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
      // The buy menu's trigger is a Button too, but Base UI stamps its own
      // data-slot on it (dropdown-menu-trigger) — include it in the row pin.
      ...header.querySelectorAll<HTMLElement>(
        "a[data-slot=button], button[data-slot=button], button[data-slot=dropdown-menu-trigger]",
      ),
    ].map((el) => el.textContent);
    expect(actions).toEqual(["♡ Like", "Bookmark", "Fork", "Copy decklist", "Buy this deck"]);
  });

  it("an account owner (isOwner, no claim token) gets the owner's row instead (Y5, D6)", () => {
    render(<DeckShareView deck={{ ...deck, isOwner: true }} cards={cards} author={author} />);
    const header = screen.getByRole("banner");
    const actions = [
      ...header.querySelectorAll<HTMLElement>(
        "a[data-slot=button], button[data-slot=button], button[data-slot=dropdown-menu-trigger]",
      ),
    ].map((el) => el.textContent);
    expect(actions).toEqual(["Open in editor", "Copy", "Share…", "Buy this deck"]);
    expect(header.querySelector(`a[href="/decks/${deck.id}/edit"]`)?.textContent).toBe(
      "Open in editor",
    );
    // One status slot for the row, as the visitor's.
    expect(header.querySelectorAll("[data-slot=copy-status]")).toHaveLength(1);
  });

  it("isOwner false is a visitor: no Open in editor", () => {
    render(<DeckShareView deck={{ ...deck, isOwner: false }} cards={cards} author={author} />);
    expect(screen.queryByText("Open in editor")).toBeNull();
    expect(screen.queryByRole("button", { name: "Share…" })).toBeNull();
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

describe("DeckShareView — the sign-in prompts (X1, REC-1)", () => {
  const prompts = (header: HTMLElement) =>
    ["♡ Like", "Bookmark", "Fork"].map((name) => within(header).getByRole("button", { name }));

  it("signed out: Like, Bookmark and Fork link /account with this deck's path as next", () => {
    render(<DeckShareView deck={deck} cards={cards} author={author} />);
    const found = prompts(screen.getByRole("banner"));
    // Button render={<Link/>} keeps role button (the W4 gotcha) — real anchors still.
    expect(found.map((el) => [el.tagName, el.getAttribute("href"), el.title])).toEqual([
      ["A", "/account?next=%2Fd%2Fuwvrnv2pv4t6", "Sign in to like decks"],
      ["A", "/account?next=%2Fd%2Fuwvrnv2pv4t6", "Sign in to bookmark decks"],
      ["A", "/account?next=%2Fd%2Fuwvrnv2pv4t6", "Sign in to fork decks"],
    ]);
  });

  it("the path is the PUBLIC id — the uuid the buttons receive never reaches the link", () => {
    render(<DeckShareView deck={deck} cards={cards} author={author} />);
    const header = screen.getByRole("banner");
    for (const el of prompts(header)) {
      expect(el.getAttribute("href")).not.toContain(deck.id);
    }
  });

  it("signed in: real buttons, no sign-in link anywhere in the action row", () => {
    render(
      <DeckShareView
        deck={deck}
        cards={cards}
        author={author}
        viewer={{ liked: false, bookmarked: false }}
      />,
    );
    const header = screen.getByRole("banner");
    for (const el of prompts(header)) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("href")).toBeNull();
    }
    expect(header.innerHTML).not.toContain("/account");
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

describe("DeckShareView — precon chrome (W8b, D7)", () => {
  const precon = {
    slug: "breed_lethality_c16",
    code: "BreedLethality_C16",
    setCode: "C16",
    setName: "Commander 2016",
    releaseDate: "2016-11-11",
    productName: "Breed Lethality",
  };
  const pricedCards: ShareDeckCard[] = [
    { ...wire(atraxa, commanderZone), card: { ...atraxa, image: null, cheapestUsd: 18.5 } },
    { ...wire(solRing, mainZone), card: { ...solRing, image: null, cheapestUsd: 1.2 }, qty: 1 },
    ...filler.map((c, i) => ({
      ...wire(c, mainZone),
      card: { ...c, image: null, cheapestUsd: i < 4 ? 10 - i : 0.1 },
    })),
  ];

  it("badge, product meta line, MTGJSON byline, price summary, and the Start CTA beside Fork — no 'Updated' anywhere", () => {
    render(
      <DeckShareView
        deck={{ ...deck, name: "Breed Lethality" }}
        cards={pricedCards}
        precon={precon}
      />,
    );
    const header = screen.getByRole("banner");

    expect(header.querySelector("[data-slot=precon-badge]")?.textContent).toBe("Precon");
    expect(header.textContent).toContain("Commander · 100 / 100 cards");
    expect(header.querySelector("[data-slot=precon-meta]")?.textContent).toBe(
      "Preconstructed deck · Commander 2016 (C16) · Released Nov 2016",
    );
    expect(header.querySelector("[data-slot=precon-byline]")?.textContent).toBe(
      "Official product list · data via MTGJSON",
    );
    // Cold-start rule: a product page never says "Updated".
    expect(header.textContent).not.toContain("Updated");

    // Est. price today = Σ qty × cheapestUsd (18.5 + 1.2 + 10+9+8+7 + 94×0.1 = 63.1 → ≈ $63),
    // priciest five by unit price.
    const prices = header.querySelector("[data-slot=precon-prices]")!;
    expect(prices.textContent).toContain("Est. price today ≈ $63 (cheapest printings)");
    expect(prices.textContent).toContain(
      "Priciest: Atraxa, Praetors' Voice ($18.50), Filler 1 ($10.00), Filler 2 ($9.00), Filler 3 ($8.00), Filler 4 ($7.00)",
    );

    // Button render={<Link/>} keeps role button (the W4 gotcha) — a real <a> still.
    const start = within(header).getByRole("button", { name: "Start from this precon" });
    expect(start.tagName).toBe("A");
    expect(start.getAttribute("href")).toBe("/decks/new?game=mtg&from=breed_lethality_c16");
    // The CTA sits in the actions row, before Fork.
    const actions = [
      ...header.querySelectorAll<HTMLElement>(
        "a[data-slot=button], button[data-slot=button], button[data-slot=dropdown-menu-trigger]",
      ),
    ].map((el) => el.textContent);
    expect(actions).toEqual([
      "♡ Like",
      "Bookmark",
      "Start from this precon",
      "Fork",
      "Copy decklist",
      "Buy this deck",
    ]);
  });

  it("a user deck shows none of the chrome (the join is the test, not the id shape)", () => {
    render(<DeckShareView deck={deck} cards={cards} author={author} />);
    const header = screen.getByRole("banner");
    expect(header.querySelector("[data-slot=precon-badge]")).toBeNull();
    expect(header.querySelector("[data-slot=precon-meta]")).toBeNull();
    expect(header.querySelector("[data-slot=precon-byline]")).toBeNull();
    expect(header.querySelector("[data-slot=precon-prices]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start from this precon" })).toBeNull();
    expect(header.textContent).toContain("Updated Sep 9, 2026");
  });

  it("no priced card → no price summary line, the rest of the chrome stays", () => {
    // The atraxa fixture ships a price — strip every price for this case.
    const unpriced = cards.map((c) => ({ ...c, card: { ...c.card, cheapestUsd: null } }));
    render(<DeckShareView deck={deck} cards={unpriced} precon={precon} />);
    const header = screen.getByRole("banner");
    expect(header.querySelector("[data-slot=precon-meta]")).toBeTruthy();
    expect(header.querySelector("[data-slot=precon-prices]")).toBeNull();
  });
});

describe("DeckShareView — the buy menu (W7, D6)", () => {
  /** Base UI menu triggers open on the pointer sequence, not a bare click. */
  function openMenu(trigger: HTMLElement) {
    fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(trigger, { button: 0 });
    fireEvent.click(trigger, { button: 0 });
  }

  const mountain = card({
    name: "Mountain",
    primaryType: "Land",
    costValue: 0,
    attrs: { type_line: "Basic Land — Mountain", oracle_text: "({T}: Add {R}.)" },
  });
  const buyCards: ShareDeckCard[] = [
    wire(atraxa, commanderZone),
    wire(solRing, mainZone),
    { ...wire(mountain, mainZone), qty: 33 },
  ];

  it("real Mass Entry links in a new tab, per-copy counts, no sponsored rel while the env is empty", async () => {
    render(<DeckShareView deck={deck} cards={buyCards} />);
    openMenu(screen.getByRole("button", { name: "Buy this deck" }));
    const menu = await screen.findByRole("menu", { name: "Buy this deck" });

    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Whole deck (35)", "Without basic lands (2)"]);
    expect(items[0].getAttribute("href")).toBe(
      massEntryUrl("Magic", ["1 Atraxa, Praetors' Voice", "1 Sol Ring", "33 Mountain"]),
    );
    expect(items[1].getAttribute("href")).toBe(
      massEntryUrl("Magic", ["1 Atraxa, Praetors' Voice", "1 Sol Ring"]),
    );
    for (const item of items) {
      expect(item.getAttribute("target")).toBe("_blank");
      expect(item.getAttribute("rel")).toBe("noopener");
    }
    // D6's footer label; the affiliate disclosure stays dark with the env unset.
    expect(menu.textContent).toContain(
      "Opens TCGplayer Mass Entry in a new tab · prices via Scryfall, updated daily.",
    );
    expect(menu.textContent).not.toContain("commission");
  });

  it("Only cards I'm missing renders only with a collection, same per-copy math as You own N/M", async () => {
    const { unmount } = render(<DeckShareView deck={deck} cards={buyCards} />);
    openMenu(screen.getByRole("button", { name: "Buy this deck" }));
    let menu = await screen.findByRole("menu", { name: "Buy this deck" });
    expect(within(menu).queryByRole("menuitem", { name: /missing/ })).toBeNull();
    unmount();

    // Owns the commander and Sol Ring → missing = the 33 Mountains.
    render(<DeckShareView deck={deck} cards={buyCards} owned={new Set([atraxa.id, solRing.id])} />);
    openMenu(screen.getByRole("button", { name: "Buy this deck" }));
    menu = await screen.findByRole("menu", { name: "Buy this deck" });
    const missing = within(menu).getByRole("menuitem", { name: "Only cards I'm missing (33)" });
    expect(missing.getAttribute("href")).toBe(massEntryUrl("Magic", ["33 Mountain"]));
  });

  it("no buy surface for a game whose adapter declares no buy (One Piece)", () => {
    const opDeck: ShareDeckMeta = { ...deck, game: "optcg", format: "standard", leaderIds: [] };
    render(<DeckShareView deck={opDeck} cards={[]} />);
    expect(screen.queryByRole("button", { name: "Buy this deck" })).toBeNull();
  });
});

describe("DeckShareView — at the table (Y5, WAVE4 D6)", () => {
  /** Base UI menu triggers open on the pointer sequence, not a bare click. */
  function openMenu(trigger: HTMLElement) {
    fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(trigger, { button: 0 });
    fireEvent.click(trigger, { button: 0 });
  }

  const AT = "2026-10-04T15:29:34.768Z";
  const FRESH: BracketFreshness = {
    readAt: "2026-10-05T07:00:00.000Z",
    feeds: {
      gameChangers: { state: "ok", asOf: AT, detail: "53 cards" },
      landDenial: { state: "ok", asOf: AT },
      extraTurns: { state: "ok", asOf: AT },
      combos: { state: "ok", asOf: AT, detail: "bulk 7.1.4" },
    },
  };
  const SERVER: ShareBracketFacts = {
    from: "server",
    state: "ready",
    combos: [],
    freshness: FRESH,
  };
  const rhystic = card({
    name: "Rhystic Study",
    primaryType: "Enchantment",
    costValue: 3,
    attrs: { type_line: "Enchantment", oracle_text: "", game_changer: true },
  });
  const rift = card({
    name: "Cyclonic Rift",
    primaryType: "Instant",
    costValue: 2,
    attrs: { type_line: "Instant", oracle_text: "", game_changer: true },
  });
  // Atraxa, two Game Changers, 97 fillers: 100 cards, at least Bracket 3.
  const gcCards: ShareDeckCard[] = [
    wire(atraxa, commanderZone),
    wire(rhystic, mainZone),
    wire(rift, mainZone),
    ...filler.slice(0, 97).map((c) => wire(c, mainZone)),
  ];
  const goals: DeckGoals = {
    v: 1,
    targetLevel: 3,
    exceptions: "one thematic Game Changer — ask me",
    answers: { rulesetVersion: 1, play: { fast: "no" } },
  };
  const visitorRow = (header: HTMLElement) =>
    [
      ...header.querySelectorAll<HTMLElement>(
        "a[data-slot=button], button[data-slot=button], button[data-slot=dropdown-menu-trigger]",
      ),
    ].map((el) => el.textContent);

  const writeText = vi.fn<(text: string) => Promise<void>>();
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    window.localStorage.clear();
  });

  it("the line after the Warden line, in the pod's words, and At the table under it", () => {
    render(<DeckShareView deck={{ ...deck, goals }} cards={gcCards} bracketFacts={SERVER} />);
    const header = screen.getByRole("banner");
    const line = header.querySelector<HTMLElement>("[data-slot=bracket-line]")!;
    expect(line.textContent).toBe(
      "Played as Bracket 3 (Upgraded) · the cards say at least 3 · Why?",
    );
    // The editor's order: the Warden's line, then the bracket line.
    const warden = within(header).getByTitle("Legal Commander deck");
    expect(warden.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const table = header.querySelector<HTMLElement>("[data-slot=at-the-table]")!;
    expect(within(table).getByRole("heading", { name: "At the table" })).toBeTruthy();
    expect([...table.querySelectorAll("[data-line]")].map((el) => el.textContent)).toEqual([
      "Game Changers (Wizards' list): Cyclonic Rift, Rhystic Study",
      "Combos (Commander Spellbook): none found",
      "Land denial / extra turns (Scryfall Tagger): none",
      "Pace (owner): doesn't usually win before turn 6",
      "Exceptions (owner): one thematic Game Changer — ask me",
    ]);
    // Card names preview and open the card's page.
    fireEvent.click(within(table).getByRole("button", { name: "Rhystic Study" }));
    expect(push).toHaveBeenCalledWith(`/cards/${rhystic.id}`);
  });

  it("the visitor row is byte-identical with the line and the card above it", () => {
    // The page's own facts: the client asks for nothing.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DeckShareView deck={deck} cards={gcCards} author={author} bracketFacts={SERVER} />);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(visitorRow(screen.getByRole("banner"))).toEqual([
      "♡ Like",
      "Bookmark",
      "Fork",
      "Copy decklist",
      "Buy this deck",
    ]);
  });

  it("a guest owner (this browser's claim token) gets the owner's row; the server never knows", () => {
    setDeckToken(deck.id, "a-claim-token");
    render(<DeckShareView deck={deck} cards={gcCards} bracketFacts={SERVER} />);
    expect(visitorRow(screen.getByRole("banner"))).toEqual([
      "Open in editor",
      "Copy",
      "Share…",
      "Buy this deck",
    ]);
  });

  it("Copy ▾ → Copy for the table pastes D6's text; Copy decklist the list; each says so", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <DeckShareView
        deck={{ ...deck, goals, isOwner: true }}
        cards={gcCards}
        bracketFacts={SERVER}
      />,
    );
    openMenu(screen.getByRole("button", { name: "Copy" }));
    const menu = await screen.findByRole("menu", { name: "Copy" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Copy decklist", "Copy for the table"]);
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy for the table" }));
    });
    expect(writeText.mock.calls[0][0].split("\n")).toEqual([
      "Atraxa Superfriends — Commander",
      "Played as Bracket 3 (Upgraded) · the cards say at least 3 · checked Oct 5, 2026",
      "Game Changers (Wizards' list): Cyclonic Rift, Rhystic Study",
      "Combos (Commander Spellbook): none found",
      "Land denial / extra turns (Scryfall Tagger): none",
      "Pace (owner): doesn't usually win before turn 6",
      "Exceptions (owner): one thematic Game Changer — ask me",
      "Reads the card list only; combos via Commander Spellbook.",
      `${window.location.origin}/d/uwvrnv2pv4t6`,
    ]);
    const status = document.querySelector<HTMLElement>("[data-slot=copy-status]")!;
    expect(status.textContent).toBe("Copied for the table");

    openMenu(screen.getByRole("button", { name: "Copy" }));
    const again = await screen.findByRole("menu", { name: "Copy" });
    await act(async () => {
      fireEvent.click(within(again).getByRole("menuitem", { name: "Copy decklist" }));
    });
    expect(writeText.mock.calls[1][0]).toContain("Rhystic Study");
    expect(status.textContent).toBe("Decklist copied");
    act(() => {
      vi.advanceTimersByTime(COPY_RESET_MS);
    });
    expect(status.textContent).toBe("");
  });

  it("no read to tell (no facts, One Piece, a draft): Copy holds only the decklist", async () => {
    render(<DeckShareView deck={{ ...deck, isOwner: true }} cards={cards} />);
    openMenu(screen.getByRole("button", { name: "Copy" }));
    const menu = await screen.findByRole("menu", { name: "Copy" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Copy decklist"]);
  });

  it("Share… copies the link where there is no phone share sheet, and opens it where there is", async () => {
    render(<DeckShareView deck={{ ...deck, isOwner: true }} cards={cards} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share…" }));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/d/uwvrnv2pv4t6`);
    expect(document.querySelector("[data-slot=copy-status]")?.textContent).toBe("Link copied");

    // A desktop share sheet (a fine pointer) is a surprise: the link is copied instead.
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(window, "matchMedia", {
      value: () => ({ matches: false }) as unknown as MediaQueryList,
      configurable: true,
    });
    writeText.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share…" }));
    });
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "matchMedia", {
      value: (q: string) => ({ matches: q === "(pointer: coarse)" }) as MediaQueryList,
      configurable: true,
    });
    writeText.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share…" }));
    });
    expect(share).toHaveBeenCalledWith({
      title: "Atraxa Superfriends",
      url: `${window.location.origin}/d/uwvrnv2pv4t6`,
    });
    expect(writeText).not.toHaveBeenCalled();

    // Closing the sheet is a choice, not a failure: nothing copied, nothing said.
    share.mockRejectedValueOnce(new DOMException("closed", "AbortError"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share…" }));
    });
    expect(writeText).not.toHaveBeenCalled();
    Reflect.deleteProperty(window, "matchMedia");
    Reflect.deleteProperty(navigator, "share");
  });

  it("Why? opens the sheet read-only — no target control, the owner's answer shown", async () => {
    const timeWarp = card({
      name: "Time Warp",
      primaryType: "Sorcery",
      costValue: 5,
      attrs: { type_line: "Sorcery", oracle_text: "", extra_turn: true },
    });
    const temporal = card({
      name: "Temporal Manipulation",
      primaryType: "Sorcery",
      costValue: 5,
      attrs: { type_line: "Sorcery", oracle_text: "", extra_turn: true },
    });
    const turnCards: ShareDeckCard[] = [
      wire(atraxa, commanderZone),
      wire(timeWarp, mainZone),
      wire(temporal, mainZone),
      ...filler.slice(0, 97).map((c) => wire(c, mainZone)),
    ];
    // The chain's question id, as the read asks it.
    const chainId = tableBracket({
      adapter: getAdapter("mtg"),
      format: COMMANDER,
      entries: turnCards.map((c) => ({ cardId: c.cardId, zone: c.zone, qty: 1, tags: [] })),
      cards: new Map(turnCards.map((c) => [c.cardId, toEditorCard(c.card)])),
      combos: [],
      freshness: FRESH,
      goals: null,
    })!.read.review.find((q) => q.id.startsWith("extra-turns:"))!.id;
    render(
      <DeckShareView
        deck={{
          ...deck,
          goals: { v: 1, answers: { rulesetVersion: 1, calls: { [chainId]: "no" } } },
        }}
        cards={turnCards}
        bracketFacts={SERVER}
      />,
    );
    const line = document.querySelector<HTMLElement>("[data-slot=bracket-line]")!;
    expect(line.textContent).toContain("the owner's answers");
    fireEvent.click(within(line).getByRole("button", { name: "Why?" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByRole("group", { name: "Your target" })).toBeNull();
    expect(sheet.querySelector("[data-slot=bracket-target]")).toBeNull();
    expect(sheet.querySelector("[data-slot=owner-answer]")?.textContent).toBe(
      "The owner's answer: No",
    );
    expect(within(sheet).queryByRole("radio")).toBeNull();
  });

  it("the private gate's facts: one GET from the client, the editor's URL, then the read", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ combos: [], freshness: FRESH }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DeckShareView deck={{ ...deck, goals }} cards={gcCards} bracketFacts={{ from: "client" }} />,
    );
    expect(document.querySelector("[data-slot=bracket-line]")?.textContent).toBe(
      "Checking combos…",
    );
    expect(document.querySelector("[data-slot=at-the-table]")).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(factsPath("mtg", factsIds(gcCards)));
    expect(await screen.findByText(/^Played as Bracket 3/)).toBeTruthy();
    expect(document.querySelector("[data-slot=at-the-table]")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("a precon has no owner: its line is the editor's own words (D5), 'your call'", () => {
    const pieceA = card({
      name: "Piece A",
      primaryType: "Artifact",
      costValue: 1,
      attrs: { type_line: "Artifact", oracle_text: "" },
    });
    const pieceB = card({
      name: "Piece B",
      primaryType: "Artifact",
      costValue: 1,
      attrs: { type_line: "Artifact", oracle_text: "" },
    });
    const pieceC = card({
      name: "Piece C",
      primaryType: "Artifact",
      costValue: 1,
      attrs: { type_line: "Artifact", oracle_text: "" },
    });
    const pending: CompleteCombo = {
      key: "s1",
      cardPieces: [pieceA.id, pieceB.id, pieceC.id].sort(),
      templates: [],
      tag: "S",
      relevant: false,
      results: ["Win the game"],
      popularity: 10,
    };
    const preconCards: ShareDeckCard[] = [
      wire(atraxa, commanderZone),
      ...[pieceA, pieceB, pieceC].map((c) => wire(c, mainZone)),
      ...filler.slice(0, 96).map((c) => wire(c, mainZone)),
    ];
    const precon = {
      slug: "breed_lethality_c16",
      code: "BreedLethality_C16",
      setCode: "C16",
      setName: "Commander 2016",
      releaseDate: "2016-11-11",
      productName: "Breed Lethality",
    };
    render(
      <DeckShareView
        deck={deck}
        cards={preconCards}
        precon={precon}
        bracketFacts={{ ...SERVER, combos: [pending] }}
      />,
    );
    expect(document.querySelector("[data-slot=bracket-line]")?.textContent).toBe(
      "Bracket 3 or 4 — one combo is your call · Why?",
    );
  });

  it("One Piece: no line, no card, no request — and nothing said about it", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const opDeck: ShareDeckMeta = { ...deck, game: "optcg", format: "standard", leaderIds: [] };
    render(<DeckShareView deck={opDeck} cards={[]} bracketFacts={{ from: "client" }} />);
    expect(document.querySelector("[data-slot=bracket-line]")).toBeNull();
    expect(document.querySelector("[data-slot=at-the-table]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/bracket/i);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
