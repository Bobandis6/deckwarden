/**
 * The art resolver (R2, REDESIGN.md §3): a single-faced card, the FRONT
 * face of a double-faced one, the attribution rule (art without an artist
 * is null), non-OK and thrown fetches, the headers and revalidate every
 * Scryfall request carries, the hold a 429 or a 403 opens, the one credit
 * builder, and the adapter gate that keeps One Piece off the network entirely.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdapter } from "@/lib/games/registry";
import {
  ambientArtKind,
  artCredit,
  artCropCardArt,
  fetchScryfallArtMeta,
  lookupCardArt,
  lookupScryfallArtMeta,
  resolveCardArt,
  SCRYFALL_REVALIDATE_S,
  SCRYFALL_USER_AGENT,
} from "./art";

const PRINTING = "cd1eb55e-1cf0-46f1-985e-e52e7bfcafee";
const CROP = "https://cards.scryfall.io/art_crop/front/c/d/cd1eb55e.jpg";

const fetchMock = vi.fn();
const errorLog = vi.spyOn(console, "error");
const processState = globalThis as unknown as { __deckwardenScryfallHoldUntilMs?: number };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  errorLog.mockReset().mockImplementation(() => {});
  delete processState.__deckwardenScryfallHoldUntilMs;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function respond(body: unknown, ok = true, status = ok ? 200 : 500, headers?: HeadersInit) {
  fetchMock.mockResolvedValueOnce({
    ok,
    status,
    headers: new Headers(headers),
    json: async () => body,
  });
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

describe("lookupScryfallArtMeta (X5): the same lookup, with the reason", () => {
  it("art and artist → the meta", async () => {
    respond({ artist: "Anna Podedworna", image_uris: { art_crop: CROP } });
    await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({
      meta: { artCropUrl: CROP, artist: "Anna Podedworna" },
    });
  });

  it("no artist, no crop, or a 404 from Scryfall → no-art", async () => {
    respond({ image_uris: { art_crop: CROP } });
    await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({ reason: "no-art" });
    respond({ artist: "Someone", image_uris: {} });
    await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({ reason: "no-art" });
    respond({ object: "error" }, false, 404);
    await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({ reason: "no-art" });
  });

  it("any other non-OK answer, or a thrown fetch → unreachable", async () => {
    respond({ object: "error" }, false, 503);
    await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({ reason: "unreachable" });
    respond({ object: "error" }, false, 429);
    await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({ reason: "unreachable" });
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({ reason: "unreachable" });
  });

  it("logs the status alone, or the error's name, and nothing for a 404", async () => {
    respond({ object: "error", details: "secret" }, false, 503);
    await lookupScryfallArtMeta(PRINTING);
    respond({ object: "error" }, false, 404);
    await lookupScryfallArtMeta(PRINTING);
    fetchMock.mockRejectedValueOnce(new TypeError("https://api.scryfall.com/cards/x failed"));
    await lookupScryfallArtMeta(PRINTING);
    expect(errorLog.mock.calls).toEqual([
      ["[art] api.scryfall.com answered 503"],
      ["[art] api.scryfall.com unreachable: TypeError"],
    ]);
  });
});

describe("the hold: a 429 or a 403 stops the calls", () => {
  const NOW = Date.parse("2026-10-31T12:00:00Z");

  /** The hold's read: an entry when the data cache has one, else the aborted fetch's rejection. */
  function expectHoldRead(call: unknown[]) {
    const [url, init] = call as [string, RequestInit & { next: { revalidate: number } }];
    expect(url).toBe(`https://api.scryfall.com/cards/${PRINTING}`);
    expect(init.signal?.aborted).toBe(true);
    expect(init.next.revalidate).toBeGreaterThan(10 * SCRYFALL_REVALIDATE_S);
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });

  it.each([429, 403])(
    "a %i: no signal before it, only the cache-only read after",
    async (status) => {
      respond({ object: "error" }, false, status);
      await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({ reason: "unreachable" });
      const [, first] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(first.signal).toBeUndefined();

      // A printing with no entry: the aborted fetch rejects, and that is no news to log.
      errorLog.mockClear();
      fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
      await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({ reason: "unreachable" });
      expectHoldRead(fetchMock.mock.calls[1]);
      expect(errorLog).not.toHaveBeenCalled();
    },
  );

  it("a warm printing keeps its art during the hold", async () => {
    respond({ object: "error" }, false, 429);
    await lookupScryfallArtMeta(PRINTING);
    respond({ artist: "Anna Podedworna", image_uris: { art_crop: CROP } });
    await expect(lookupScryfallArtMeta(PRINTING)).resolves.toEqual({
      meta: { artCropUrl: CROP, artist: "Anna Podedworna" },
    });
    expectHoldRead(fetchMock.mock.calls[1]);
  });

  it("lasts 60 seconds by default, then the next lookup calls again", async () => {
    respond({ object: "error" }, false, 429);
    await lookupScryfallArtMeta(PRINTING);

    vi.setSystemTime(NOW + 59_000);
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await lookupScryfallArtMeta(PRINTING);
    expectHoldRead(fetchMock.mock.calls[1]);

    vi.setSystemTime(NOW + 60_000);
    respond({ artist: "Anna Podedworna", image_uris: { art_crop: CROP } });
    await lookupScryfallArtMeta(PRINTING);
    const [, after] = fetchMock.mock.calls[2] as [string, RequestInit & { next: unknown }];
    expect(after.signal).toBeUndefined();
    expect(after.next).toEqual({ revalidate: SCRYFALL_REVALIDATE_S });
  });

  it.each([
    ["a longer Retry-After is honored", "120", 120],
    ["a shorter one still holds the minute", "5", 60],
    ["a date is not a number of seconds", "Sat, 31 Oct 2026 12:30:00 GMT", 60],
    ["a huge one stops at an hour", "999999", 3600],
  ])("%s", async (_, retryAfter, seconds) => {
    respond({ object: "error" }, false, 429, { "Retry-After": retryAfter });
    await lookupScryfallArtMeta(PRINTING);
    expect(processState.__deckwardenScryfallHoldUntilMs).toBe(NOW + seconds * 1000);
  });

  it.each([500, 503])("a %i opens no hold: warm printings were never at risk", async (status) => {
    respond({ object: "error" }, false, status);
    await lookupScryfallArtMeta(PRINTING);
    expect(processState.__deckwardenScryfallHoldUntilMs).toBeUndefined();
  });

  it("a thrown fetch opens no hold either", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await lookupScryfallArtMeta(PRINTING);
    expect(processState.__deckwardenScryfallHoldUntilMs).toBeUndefined();
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

  it("lookupCardArt calls a failure transient and a stable answer not", async () => {
    const mtg = getAdapter("mtg");
    respond({ artist: "Anna Podedworna", image_uris: { art_crop: CROP } });
    await expect(lookupCardArt(mtg, PRINTING)).resolves.toMatchObject({ transient: false });
    respond({ image_uris: { art_crop: CROP } });
    await expect(lookupCardArt(mtg, PRINTING)).resolves.toEqual({ art: null, transient: false });
    respond({ object: "error" }, false, 404);
    await expect(lookupCardArt(mtg, PRINTING)).resolves.toEqual({ art: null, transient: false });
    respond({ object: "error" }, false, 503);
    await expect(lookupCardArt(mtg, PRINTING)).resolves.toEqual({ art: null, transient: true });
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(lookupCardArt(mtg, PRINTING)).resolves.toEqual({ art: null, transient: true });
  });

  it("lookupCardArt for a One Piece printing is a stable null, off the network", async () => {
    await expect(lookupCardArt(getAdapter("optcg"), PRINTING)).resolves.toEqual({
      art: null,
      transient: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
