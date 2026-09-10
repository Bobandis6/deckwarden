/**
 * The art resolver (R2, REDESIGN.md §3): a single-faced card, the FRONT
 * face of a double-faced one, the attribution rule (art without an artist
 * is null), non-OK and thrown fetches, the headers and revalidate every
 * Scryfall request carries, the one credit builder, and the adapter gate
 * that keeps One Piece off the network entirely.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdapter } from "@/lib/games/registry";
import {
  ambientArtKind,
  artCredit,
  artCropCardArt,
  fetchScryfallArtMeta,
  resolveCardArt,
  SCRYFALL_REVALIDATE_S,
  SCRYFALL_USER_AGENT,
} from "./art";

const PRINTING = "cd1eb55e-1cf0-46f1-985e-e52e7bfcafee";
const CROP = "https://cards.scryfall.io/art_crop/front/c/d/cd1eb55e.jpg";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(body: unknown, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
}

describe("fetchScryfallArtMeta", () => {
  it("a single-faced card → its crop and artist, with the real headers and a daily revalidate", async () => {
    respond({ artist: "Anna Podedworna", image_uris: { art_crop: CROP } });
    await expect(fetchScryfallArtMeta(PRINTING)).resolves.toEqual({
      artCropUrl: CROP,
      artist: "Anna Podedworna",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { next: unknown }];
    expect(url).toBe(`https://api.scryfall.com/cards/${PRINTING}`);
    expect(init.headers).toEqual({
      "User-Agent": SCRYFALL_USER_AGENT,
      Accept: "application/json",
    });
    expect(init.next).toEqual({ revalidate: SCRYFALL_REVALIDATE_S });
    expect(SCRYFALL_USER_AGENT).toMatch(/^Deckwarden\/1\.0 /);
    expect(SCRYFALL_REVALIDATE_S).toBe(86400);
  });

  it("a double-faced card → the FRONT face's crop and artist", async () => {
    respond({
      card_faces: [
        { artist: "Front Artist", image_uris: { art_crop: "https://cards.scryfall.io/front.jpg" } },
        { artist: "Back Artist", image_uris: { art_crop: "https://cards.scryfall.io/back.jpg" } },
      ],
    });
    await expect(fetchScryfallArtMeta(PRINTING)).resolves.toEqual({
      artCropUrl: "https://cards.scryfall.io/front.jpg",
      artist: "Front Artist",
    });
  });

  it("art without an artist is null (never unattributed art), and so is an artist without art", async () => {
    respond({ image_uris: { art_crop: CROP } });
    await expect(fetchScryfallArtMeta(PRINTING)).resolves.toBeNull();
    respond({ artist: "Someone", image_uris: {} });
    await expect(fetchScryfallArtMeta(PRINTING)).resolves.toBeNull();
  });

  it("a non-OK response and a thrown fetch are both null", async () => {
    respond({ object: "error" }, false);
    await expect(fetchScryfallArtMeta(PRINTING)).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(fetchScryfallArtMeta(PRINTING)).resolves.toBeNull();
  });
});

describe("CardArt", () => {
  it("artCredit is the one attribution line; artCropCardArt builds the descriptor with it", () => {
    expect(artCredit("Anna Podedworna")).toBe("Art: Anna Podedworna · ™ & © Wizards of the Coast");
    expect(artCropCardArt({ artCropUrl: CROP, artist: "Anna Podedworna" })).toEqual({
      url: CROP,
      layout: "art_crop",
      artist: "Anna Podedworna",
      credit: "Art: Anna Podedworna · ™ & © Wizards of the Coast",
    });
  });
});

describe("the adapter gate", () => {
  it("Magic declares art_crop; One Piece declares nothing", () => {
    expect(ambientArtKind(getAdapter("mtg"))).toBe("art_crop");
    expect(ambientArtKind(getAdapter("optcg"))).toBeNull();
    expect(getAdapter("optcg").capabilities.ambientArt).toBeUndefined();
  });

  it("resolveCardArt for a One Piece printing is null WITHOUT calling Scryfall", async () => {
    await expect(resolveCardArt(getAdapter("optcg"), PRINTING)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolveCardArt for Magic goes through the resolver and carries the credit", async () => {
    respond({ artist: "Anna Podedworna", image_uris: { art_crop: CROP } });
    await expect(resolveCardArt(getAdapter("mtg"), PRINTING)).resolves.toEqual({
      url: CROP,
      layout: "art_crop",
      artist: "Anna Podedworna",
      credit: artCredit("Anna Podedworna"),
    });
    respond({ image_uris: { art_crop: CROP } });
    await expect(resolveCardArt(getAdapter("mtg"), PRINTING)).resolves.toBeNull();
  });
});
