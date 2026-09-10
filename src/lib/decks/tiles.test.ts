/**
 * The tile helpers (R5a): the row → tile step behind every deck collection
 * — the `small` image through the Scryfall-only gate (a One Piece mirror
 * URL answers null, so the tile makes no request until LATER row 51), the
 * 3 px identity strip from `ci_mask` in each game's display order with
 * partners OR'd and mask 0 neutral, the gradient slot paint, the byline
 * opt-in, the owner-only visibility word, and the UTC-pinned date.
 */
import { describe, expect, it } from "vitest";

import {
  deckTileData,
  leaderTileImage,
  rowPrinting,
  stripBackground,
  tileFromDeck,
  tileSwatches,
} from "./tiles";

const QUEZA_PRINTING = { id: "064a84dd-bb7c-4980-a031-23c778e37f73", imageOverride: null };
const ENEL_PRINTING = {
  id: "2b673a2b-b8cb-5b50-92de-f919bd839b49",
  imageOverride: {
    front: "https://pub-6d142676dd964e79abf609637297c45d.r2.dev/optcg/images/OP15-058.png",
  },
};

const base = {
  publicId: "q9j9uxphwp9n",
  name: "Queza — The Agony Engine",
  gameId: 1,
  formatId: 1,
  visibility: "public" as const,
  ciMask: 7,
  likesCount: 0,
  updatedAt: new Date("2026-09-09T04:13:26.820Z"),
  authorName: "Bobandis6",
  authorUsername: "bobandis6",
};

describe("leaderTileImage", () => {
  it("is the small Scryfall rendition for a Magic default printing", () => {
    expect(leaderTileImage(QUEZA_PRINTING)).toBe(
      "https://cards.scryfall.io/small/front/0/6/064a84dd-bb7c-4980-a031-23c778e37f73.jpg",
    );
  });

  it("is null for the One Piece mirror (LATER row 51) and for no printing", () => {
    expect(leaderTileImage(ENEL_PRINTING)).toBeNull();
    expect(leaderTileImage(null)).toBeNull();
    expect(leaderTileImage(undefined)).toBeNull();
  });

  it("rowPrinting folds the joined columns back into a printing, or null", () => {
    expect(rowPrinting({ printingId: null, imageOverride: null })).toBeNull();
    expect(rowPrinting({ printingId: QUEZA_PRINTING.id, imageOverride: null })).toEqual({
      id: QUEZA_PRINTING.id,
      imageOverride: null,
    });
  });
});

describe("the identity strip (G8)", () => {
  it("segments Magic identities in WUBRG order with equal hard stops", () => {
    expect(stripBackground(tileSwatches("mtg", 7))).toBe(
      "linear-gradient(to right, var(--mana-w) 0% 33.33%, var(--mana-u) 33.33% 66.67%, var(--mana-b) 66.67% 100%)",
    );
    // Atraxa: W U B G (no red) stays in WUBRG order.
    expect(tileSwatches("mtg", 23)).toEqual([
      "var(--mana-w)",
      "var(--mana-u)",
      "var(--mana-b)",
      "var(--mana-g)",
    ]);
  });

  it("partners are OR'd into one mask before painting (leaderDenorm's rule)", () => {
    const tymna = 1 | 4; // W B
    const thrasios = 2 | 16; // U G
    expect(tileSwatches("mtg", tymna | thrasios)).toEqual([
      "var(--mana-w)",
      "var(--mana-u)",
      "var(--mana-b)",
      "var(--mana-g)",
    ]);
  });

  it("mask 0 is the game's neutral swatch, one color is just that color", () => {
    expect(stripBackground(tileSwatches("mtg", 0))).toBe("var(--mana-c)");
    expect(stripBackground(tileSwatches("mtg", 8 | 1))).toBe(
      "linear-gradient(to right, var(--mana-w) 0% 50%, var(--mana-r) 50% 100%)",
    );
    expect(stripBackground(tileSwatches("optcg", 0))).toBe("#9e9e9e");
    expect(stripBackground(tileSwatches("optcg", 32))).toBe("#6a1b9a");
  });

  it("One Piece follows Bandai's order (Red Green Blue Purple Black Yellow)", () => {
    // Boa Hancock OP14-041: Yellow (1) + Blue (2).
    expect(tileSwatches("optcg", 3)).toEqual(["#1565c0", "#f9a825"]);
    expect(stripBackground(tileSwatches(null, 7))).toBe("var(--border)");
  });
});

describe("tileFromDeck", () => {
  it("a Magic rail row: small image, chip, format, byline, no visibility, ♥ hidden at 0", () => {
    const tile = tileFromDeck(base, QUEZA_PRINTING, { href: "/d/q9j9uxphwp9n" });
    expect(tile).toMatchObject({
      href: "/d/q9j9uxphwp9n",
      name: "Queza — The Agony Engine",
      game: "mtg",
      gameLabel: "Magic",
      formatLabel: "Commander",
      visibility: null,
      updatedLabel: "Sep 9",
      likesCount: 0,
      ciMask: 7,
      author: "Bobandis6",
    });
    expect(tile.leaderImage).toContain("cards.scryfall.io/small/");
    expect(tile.strip.startsWith("linear-gradient(to right, var(--mana-w)")).toBe(true);
    expect(tile.slotGradient).toContain("var(--mana-w)");
  });

  it("a One Piece row: no image (gated), Purple strip and slot, format Standard, ♥ 1", () => {
    const tile = tileFromDeck(
      {
        ...base,
        publicId: "jhr5ax43ewx7",
        name: "Six DON!!, Endless Thunder",
        gameId: 2,
        formatId: 2,
        ciMask: 32,
        likesCount: 1,
      },
      ENEL_PRINTING,
      { href: "/d/jhr5ax43ewx7" },
    );
    expect(tile.leaderImage).toBeNull();
    expect(tile.gameLabel).toBe("One Piece");
    expect(tile.formatLabel).toBe("Standard");
    expect(tile.strip).toBe("#6a1b9a");
    expect(tile.slotGradient).toBe(
      "radial-gradient(ellipse 90% 80% at 50% 40%, #6a1b9a 0%, transparent 70%)",
    );
    expect(tile.likesCount).toBe(1);
  });

  it("the byline needs a username; the visibility word needs an owner surface", () => {
    expect(
      tileFromDeck({ ...base, authorUsername: null }, null, { href: "/d/x" }).author,
    ).toBeNull();
    expect(
      tileFromDeck({ ...base, authorUsername: undefined, authorName: undefined }, null, {
        href: "/d/x",
      }).author,
    ).toBeNull();
    const owner = tileFromDeck(base, QUEZA_PRINTING, {
      href: "/decks/abc/edit",
      showVisibility: true,
      byline: false,
    });
    expect(owner.visibility).toBe("public");
    expect(owner.href).toBe("/decks/abc/edit");
    expect(owner.author).toBeNull();
  });

  it("the date is UTC-pinned (hydration rule) and an unknown game gets no chip", () => {
    const late = tileFromDeck({ ...base, updatedAt: new Date("2026-09-09T23:30:00Z") }, null, {
      href: "/d/x",
    });
    expect(late.updatedLabel).toBe("Sep 9");
    const azuki = tileFromDeck({ ...base, gameId: 3, formatId: 99 }, null, { href: "/d/x" });
    expect(azuki.game).toBeNull();
    expect(azuki.gameLabel).toBe("");
    expect(azuki.formatLabel).toBe("");
    expect(azuki.strip).toBe("var(--border)");
  });
});

describe("deckTileData over the wire shape (POST /api/decks/mine)", () => {
  it("takes the game and format codes plus an ISO date", () => {
    const tile = deckTileData({
      href: "/decks/11111111-1111-4111-8111-111111111111/edit",
      name: "Untitled",
      game: "mtg",
      formatCode: "commander",
      visibility: "unlisted",
      updatedAt: "2026-09-10T02:30:00.000Z",
      likesCount: 0,
      ciMask: 0,
      leaderImage: null,
    });
    expect(tile.formatLabel).toBe("Commander");
    expect(tile.visibility).toBe("unlisted");
    expect(tile.updatedLabel).toBe("Sep 10");
    expect(tile.strip).toBe("var(--mana-c)");
    expect(tile.author).toBeNull();
  });
});
