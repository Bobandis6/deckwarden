/**
 * The OG wrapper over the R2 resolver: `fetchOgArt` still hands satori a
 * data URI plus the artist, fetching the crop's bytes with the real
 * User-Agent and the daily revalidate, and passes every null through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCRYFALL_USER_AGENT } from "@/lib/cards/art";
import { fetchOgArt, lookupOgArt } from "./scryfall";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOgArt", () => {
  it("resolves meta, then the bytes → a data:image/jpeg;base64 URI with the artist", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artist: "Anna Podedworna",
        image_uris: { art_crop: "https://cards.scryfall.io/art_crop/x.jpg" },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
    });
    const art = await fetchOgArt("cd1eb55e-1cf0-46f1-985e-e52e7bfcafee");
    expect(art).toEqual({ dataUri: "data:image/jpeg;base64,/9j/", artist: "Anna Podedworna" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit & { next: unknown }];
    expect(url).toBe("https://cards.scryfall.io/art_crop/x.jpg");
    expect(init.headers).toEqual({ "User-Agent": SCRYFALL_USER_AGENT, Accept: "image/*" });
    expect(init.next).toEqual({ revalidate: 86400 });
  });

  it("null meta (no artist) → null without fetching bytes; a failed byte fetch → null", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ image_uris: { art_crop: "https://cards.scryfall.io/art_crop/x.jpg" } }),
    });
    await expect(fetchOgArt("cd1eb55e-1cf0-46f1-985e-e52e7bfcafee")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artist: "Someone",
        image_uris: { art_crop: "https://cards.scryfall.io/art_crop/x.jpg" },
      }),
    });
    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(fetchOgArt("cd1eb55e-1cf0-46f1-985e-e52e7bfcafee")).resolves.toBeNull();
  });
});

describe("lookupOgArt: a failure is transient, so the CDN doesn't keep the artless image", () => {
  const PRINTING = "cd1eb55e-1cf0-46f1-985e-e52e7bfcafee";
  const META = {
    ok: true,
    json: async () => ({
      artist: "Someone",
      image_uris: { art_crop: "https://cards.scryfall.io/art_crop/x.jpg" },
    }),
  };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("art, or a printing with no artist, is a stable answer", async () => {
    fetchMock.mockResolvedValueOnce(META);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
    });
    await expect(lookupOgArt(PRINTING)).resolves.toEqual({
      art: { dataUri: "data:image/jpeg;base64,/9j/", artist: "Someone" },
      transient: false,
    });

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ image_uris: {} }) });
    await expect(lookupOgArt(PRINTING)).resolves.toEqual({ art: null, transient: false });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(lookupOgArt(PRINTING)).resolves.toEqual({ art: null, transient: false });
  });

  it("a failed lookup, a failed crop or a thrown fetch is transient", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(lookupOgArt(PRINTING)).resolves.toEqual({ art: null, transient: true });

    fetchMock.mockResolvedValueOnce(META);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(lookupOgArt(PRINTING)).resolves.toEqual({ art: null, transient: true });

    fetchMock.mockResolvedValueOnce(META);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(lookupOgArt(PRINTING)).resolves.toEqual({ art: null, transient: true });
  });
});
