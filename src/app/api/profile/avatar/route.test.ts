// @vitest-environment node
/**
 * PUT /api/profile/avatar (X5, WAVE3.md D5): the order of checks, the three
 * kinds, every card-art refusal, and the one write — through the REAL
 * drizzle builders over a fake postgres.js client (the X2/X3 route-test
 * pattern), so the statements counted here are the route's own. The session
 * and the limiter are mocked at their module seams; Scryfall is a stubbed
 * fetch. Live answers: the curl 401s on dev and prod (X5's ship note).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";

interface Statement {
  sql: string;
  params: unknown[];
}
let statements: Statement[] = [];
let answers: unknown[][][] = [];

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[]) {
    statements.push({ sql, params });
    const rows = answers.shift() ?? [];
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const session = { userId: null as string | null };
vi.mock("@/lib/auth", () => ({
  getSessionUserId: async () => session.userId,
}));

const limiter = {
  calls: [] as string[][],
  answer: null as NextResponse | null,
};
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: async (limits: { key: string }[]) => {
    limiter.calls.push(limits.map((l) => l.key));
    return limiter.answer;
  },
}));

const { PUT, AVATAR_ERRORS } = await import("./route");

const USER = "0b5a4f8e-1111-4222-8333-944445555666";
const SOL_RING = "6ad8011d-3471-4369-9d68-b264cc027487";
const SOL_PRINTING = "1b59533a-3e16-4ab4-9b7a-4bd6a5d1f2d6";

const fetchMock = vi.fn();

function put(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/profile/avatar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

/** The card lookup's row, in select order: name, gameId, printingId. */
function cardRow(opts: { game?: number; printing?: string | null } = {}): unknown[] {
  return [
    "Sol Ring",
    opts.game ?? GAME_ID.mtg,
    opts.printing === undefined ? SOL_PRINTING : opts.printing,
  ];
}

function scryfall(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}

const updates = () => statements.filter((s) => s.sql.startsWith("update"));

beforeEach(() => {
  statements = [];
  answers = [];
  session.userId = USER;
  limiter.calls = [];
  limiter.answer = null;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the order of checks", () => {
  it("signed out → 401 before the limiter, the body or the database", async () => {
    session.userId = null;
    const res = await PUT(put(undefined, "not json"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: AVATAR_ERRORS.signedOut });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(limiter.calls).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("the limiter runs next, on its own per-user bucket, before the body is read", async () => {
    limiter.answer = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const res = await PUT(put(undefined, "not json"));
    expect(res.status).toBe(429);
    expect(limiter.calls).toEqual([[`profile-avatar:user:${USER}`]]);
    expect(statements).toEqual([]);
  });

  it("then JSON (400), then the union (400): nothing is written", async () => {
    expect((await PUT(put(undefined, "{not json"))).status).toBe(400);
    for (const body of [
      {},
      { kind: "upload" },
      { kind: "art" },
      { kind: "art", cardId: "not-a-uuid" },
      { kind: "art", printingId: SOL_PRINTING },
      "provider",
    ]) {
      const res = await PUT(put(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(statements).toEqual([]);
  });
});

describe("the three kinds", () => {
  it("provider → NULL, in one update", async () => {
    const res = await PUT(put({ kind: "provider" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ avatar: null });
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toMatch(/^update "users" set "avatar" = \$1, "updated_at" = \$2/);
    expect(statements[0].params[0]).toBeNull();
    expect(statements[0].params.at(-1)).toBe(USER);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("initial → {kind:'initial'}, in one update", async () => {
    const res = await PUT(put({ kind: "initial" }));
    expect(await res.json()).toEqual({ avatar: { kind: "initial" } });
    expect(statements).toHaveLength(1);
    expect(JSON.parse(String(statements[0].params[0]))).toEqual({ kind: "initial" });
  });

  it("card art → the live default printing, the card's name and Scryfall's artist; no URL stored", async () => {
    answers = [[cardRow()]];
    scryfall(200, {
      artist: "Mark Tedin",
      image_uris: {
        art_crop: `https://cards.scryfall.io/art_crop/front/1/b/${SOL_PRINTING}.jpg?1`,
      },
    });
    const res = await PUT(put({ kind: "art", cardId: SOL_RING }));
    expect(res.status).toBe(200);
    const stored = {
      kind: "art",
      printingId: SOL_PRINTING,
      cardName: "Sol Ring",
      artist: "Mark Tedin",
    };
    expect(await res.json()).toEqual({ avatar: stored });

    // Two statements: the lookup, then the write.
    expect(statements).toHaveLength(2);
    const [lookup, write] = statements;
    expect(lookup.sql).toContain('left join "card_printings"');
    expect(lookup.sql).toContain('"card_printings"."is_default" = $');
    expect(lookup.sql).toContain('"card_printings"."is_removed" = $');
    expect(lookup.sql).toContain('"card_identities"."is_removed" = $');
    expect(lookup.params).toContain(SOL_RING);
    expect(JSON.parse(String(write.params[0]))).toEqual(stored);
    expect(String(write.params[0])).not.toContain("http");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.scryfall.com/cards/${SOL_PRINTING}`);
    expect(init.headers).toMatchObject({ Accept: "application/json" });
  });
});

describe("card-art refusals: a sentence each, the current picture untouched", () => {
  async function refused(status: number, error: string) {
    const res = await PUT(put({ kind: "art", cardId: SOL_RING }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(updates()).toEqual([]);
  }

  it("an unknown or removed card → 404, no network", async () => {
    answers = [[]];
    await refused(404, AVATAR_ERRORS.notFound);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a game that declares no ambient art (One Piece) → 400, no network", async () => {
    answers = [[cardRow({ game: GAME_ID.optcg })]];
    await refused(400, AVATAR_ERRORS.notMagic);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no live default printing → 404, no network", async () => {
    answers = [[cardRow({ printing: null })]];
    await refused(404, AVATAR_ERRORS.noPrinting);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Scryfall names no artist → 422", async () => {
    answers = [[cardRow()]];
    scryfall(200, { image_uris: { art_crop: "https://cards.scryfall.io/x.jpg" } });
    await refused(422, AVATAR_ERRORS.noArtist);
  });

  it("Scryfall unreachable (5xx or a thrown fetch) → 503", async () => {
    answers = [[cardRow()]];
    scryfall(503);
    await refused(503, AVATAR_ERRORS.unreachable);
    answers = [[cardRow()]];
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await refused(503, AVATAR_ERRORS.unreachable);
  });
});
