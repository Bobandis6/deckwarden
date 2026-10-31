// @vitest-environment node
/**
 * GET /api/cards/[id]/art: the order of business and, above all, what each
 * answer lets the CDN keep. The real drizzle builders run over a fake
 * postgres.js client and the real resolver over a stubbed `fetch`, so a
 * Scryfall status goes all the way to the response header. A limiter refusal
 * reaches neither; the counting is src/lib/rate-limit-enforce.test.ts's.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

let statements: string[] = [];
let answers: unknown[][][] = [];

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string) {
    statements.push(sql);
    const rows = answers.shift() ?? [];
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const limiter = { calls: [] as string[][], answer: null as NextResponse | null };
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: async (limits: { key: string }[]) => {
    limiter.calls.push(limits.map((l) => l.key));
    return limiter.answer;
  },
}));

const defaultPrinting = vi.fn();
vi.mock("@/lib/hub/queries", () => ({
  loadDefaultPrinting: (id: string) => defaultPrinting(id),
}));

const { GET } = await import("./route");

const CARD = "11111111-1111-4111-8111-111111111111";
const PRINTING = "22222222-2222-4222-8222-222222222222";
const CROP = "https://cards.scryfall.io/art_crop/front/2/2/22222222.jpg";
const DAY = "public, s-maxage=86400, stale-while-revalidate=86400";
const HOUR = "public, s-maxage=3600, stale-while-revalidate=3600";

const fetchMock = vi.fn();

function call(id = CARD, query = `?printingId=${PRINTING}`) {
  const request = new NextRequest(`http://localhost/api/cards/${id}/art${query}`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
  return GET(request, { params: Promise.resolve({ id }) });
}

/** The card select's row, then the printing select's, in column order. */
function magicCard() {
  answers = [[[CARD, 1]], [[PRINTING]]];
}

function scryfallAnswers(status: number, body: unknown = { object: "error" }) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  });
}

beforeEach(() => {
  statements = [];
  answers = [];
  limiter.calls = [];
  limiter.answer = null;
  defaultPrinting.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete (globalThis as unknown as { __deckwardenScryfallHoldUntilMs?: number })
    .__deckwardenScryfallHoldUntilMs;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/cards/[id]/art", () => {
  it("consumes the caller's bucket first, and a refusal reaches nothing else", async () => {
    limiter.answer = NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const res = await call();
    expect(res.status).toBe(429);
    expect(limiter.calls).toEqual([["card-art:ip:203.0.113.9", "card-art:ip-hour:203.0.113.9"]]);
    expect(statements).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a healthy printing answers its art for the CDN to keep a day", async () => {
    magicCard();
    scryfallAnswers(200, { artist: "Anna Podedworna", image_uris: { art_crop: CROP } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(DAY);
    await expect(res.json()).resolves.toMatchObject({
      art: { url: CROP, layout: "art_crop", artist: "Anna Podedworna" },
    });
  });

  it("a printing with no artist, or one Scryfall doesn't know, is a stable null for a day", async () => {
    magicCard();
    scryfallAnswers(200, { image_uris: { art_crop: CROP } });
    const noArtist = await call();
    expect(noArtist.headers.get("cache-control")).toBe(DAY);
    await expect(noArtist.json()).resolves.toEqual({ art: null });

    magicCard();
    scryfallAnswers(404);
    const unknown = await call();
    expect(unknown.headers.get("cache-control")).toBe(DAY);
    await expect(unknown.json()).resolves.toEqual({ art: null });
  });

  it.each([429, 403, 500, 503])(
    "a %i from Scryfall answers null under no-store, so the blip isn't kept",
    async (status) => {
      magicCard();
      scryfallAnswers(status);
      const res = await call();
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      await expect(res.json()).resolves.toEqual({ art: null });
    },
  );

  it("a thrown fetch answers null under no-store too", async () => {
    magicCard();
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    const res = await call();
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ art: null });
  });

  it("a One Piece card is a stable null before any printing lookup or network", async () => {
    answers = [[[CARD, 2]]];
    const res = await call();
    expect(res.headers.get("cache-control")).toBe(DAY);
    await expect(res.json()).resolves.toEqual({ art: null });
    expect(statements).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no printing named reads the card's default", async () => {
    answers = [[[CARD, 1]]];
    defaultPrinting.mockResolvedValue({ id: PRINTING });
    scryfallAnswers(200, { artist: "Anna Podedworna", image_uris: { art_crop: CROP } });
    const res = await call(CARD, "");
    expect(res.headers.get("cache-control")).toBe(DAY);
    expect(defaultPrinting).toHaveBeenCalledWith(CARD);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.scryfall.com/cards/${PRINTING}`);
  });

  it("an unknown card or another card's printing is a 404 for an hour, off the network", async () => {
    answers = [[]];
    const noCard = await call();
    expect(noCard.status).toBe(404);
    expect(noCard.headers.get("cache-control")).toBe(HOUR);

    answers = [[[CARD, 1]], []];
    const noPrinting = await call();
    expect(noPrinting.status).toBe(404);
    expect(noPrinting.headers.get("cache-control")).toBe(HOUR);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a malformed id or printing is a 400 with no cache header", async () => {
    const badCard = await call("not-a-uuid");
    expect(badCard.status).toBe(400);
    expect(badCard.headers.get("cache-control")).toBeNull();

    const badPrinting = await call(CARD, "?printingId=nope");
    expect(badPrinting.status).toBe(400);
    expect(badPrinting.headers.get("cache-control")).toBeNull();
    expect(statements).toEqual([]);
  });
});
