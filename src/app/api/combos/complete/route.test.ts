// @vitest-environment node
/**
 * GET /api/combos/complete (Y4a, WAVE4 D5): the statements it sends and the
 * body it answers, through the REAL drizzle builders over a fake postgres.js
 * client (X3's route-test pattern) — so the statement count (two: the
 * complete combos, then each source's latest run; none for any 400), the
 * freshness the adapter judges from those runs and the cache header are
 * what the route really does. The limiter is a stand-in (its upserts are
 * counted on dev with DB_LOG); the live answers are smoke:combos'.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { RATE_LIMITS } from "@/lib/rate-limit";

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

const limiter = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: limiter.enforceRateLimit,
}));

const { GET } = await import("./route");

const KIKI = "ba951d7e-9938-411d-8f03-8a10c59cd5cf";
const CONSCRIPTS = "3c309669-cdfe-4a9e-82b2-418bbc4754a8";
const SOL = "fe0aa3d8-7d4c-4b6f-a1c0-5a8f1e1f0b2a";
const IDS = [KIKI, CONSCRIPTS, SOL].sort();

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
const SCRYFALL_AT = "2026-10-04T15:29:34.768Z";
const SPELLBOOK_AT = "2026-10-04T15:31:00.000Z";

/** A loadCompleteCombos row in its column order. */
const comboRow = [
  "618-1537",
  [KIKI, CONSCRIPTS].sort(),
  [],
  "C",
  true,
  ["Infinite creature tokens with haste", "Infinite death triggers"],
  28185,
];
/** loadLatestRuns rows in their column order: source, id, started_at, stats. */
const runRows = [
  [
    "scryfall",
    271,
    SCRYFALL_AT,
    {
      game_changers: { count: 53, md5: "38ff92800a67529ee6b9fa81f4203033" },
      tagger: { status: { mld: "fresh", extra_turn: "fresh" } },
    },
  ],
  ["spellbook", 272, SPELLBOOK_AT, { bracket_tags: { C: 194 }, source_version: "7.1.4" }],
];

async function get(search: string, headers: Record<string, string> = {}) {
  const res = await GET(
    new NextRequest(`http://localhost/api/combos/complete${search}`, { headers }),
  );
  return { res, body: await res.json() };
}

beforeEach(() => {
  statements = [];
  answers = [];
  limiter.enforceRateLimit.mockReset();
  limiter.enforceRateLimit.mockResolvedValue(null);
});

describe("GET /api/combos/complete", () => {
  it("an id set: two statements — its complete combos, then each source's latest run — and { combos, freshness } with an hour at the edge", async () => {
    answers = [[comboRow], runRows];
    // As Next's server hands it to the handler: the query re-serialized, its
    // commas encoded (measured on dev — the client sends literal ones).
    const { res, body } = await get(`?game=mtg&ids=${IDS.join("%2C")}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CACHE);

    expect(statements).toHaveLength(2);
    const [combos, runs] = statements;
    expect(combos.sql).toContain('"combo_pieces"."card_identity_id" in ($1, $2, $3)');
    // Complete only: the held pieces equal the combo's piece count (the
    // subquery's alias renders bare).
    expect(combos.sql).toContain('"combos"."piece_count" = "held_count"');
    expect(combos.params).toEqual(IDS);
    expect(runs.sql).toContain('select distinct on ("ingest_runs"."source")');
    expect(runs.params).toEqual(expect.arrayContaining(["scryfall", "spellbook", "succeeded"]));

    expect(body.combos).toEqual([
      {
        key: "618-1537",
        cardPieces: [KIKI, CONSCRIPTS].sort(),
        templates: [],
        tag: "C",
        relevant: true,
        results: ["Infinite creature tokens with haste", "Infinite death triggers"],
        popularity: 28185,
      },
    ]);
    // The adapter's judgement of those runs, as of the request.
    expect(body.freshness.feeds).toEqual({
      gameChangers: { state: "ok", asOf: SCRYFALL_AT, detail: "53 cards" },
      landDenial: { state: "ok", asOf: SCRYFALL_AT },
      extraTurns: { state: "ok", asOf: SCRYFALL_AT },
      combos: { state: "ok", asOf: SPELLBOOK_AT, detail: "bulk 7.1.4" },
    });
    expect(typeof body.freshness.readAt).toBe("string");
  });

  it("the client's literal commas and the server's encoded ones read as the same set", async () => {
    answers = [[comboRow], runRows, [comboRow], runRows];
    const literal = await get(`?game=mtg&ids=${IDS.join(",")}`);
    const encoded = await get(`?game=mtg&ids=${IDS.join("%2C")}`);
    expect([literal.res.status, encoded.res.status]).toEqual([200, 200]);
    expect(statements[0].params).toEqual(IDS);
    expect(statements[2].params).toEqual(IDS);
  });

  it("asks its own bucket first, keyed by the caller's IP; a 429 answers before any statement", async () => {
    const tooMany = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    limiter.enforceRateLimit.mockResolvedValueOnce(tooMany);
    const { res } = await get(`?game=mtg&ids=${IDS.join(",")}`, {
      "x-forwarded-for": "203.0.113.7",
    });
    expect(res.status).toBe(429);
    expect(statements).toHaveLength(0);
    expect(limiter.enforceRateLimit).toHaveBeenCalledWith(RATE_LIMITS.comboFacts("203.0.113.7"));
    expect(RATE_LIMITS.comboFacts("203.0.113.7")).toEqual([
      { key: "combo-facts:ip:203.0.113.7", max: 60, windowSeconds: 60 },
      { key: "combo-facts:ip-hour:203.0.113.7", max: 600, windowSeconds: 3600 },
    ]);
  });

  it("one URL per set: anything but the canonical spelling is a 400, before any statement and with no cache header", async () => {
    const [a, b, c] = IDS;
    const cases: Record<string, string> = {
      "no game": `?ids=${a}`,
      "an unknown game": `?game=azuki&ids=${a}`,
      "no ids": "?game=mtg",
      "empty ids": "?game=mtg&ids=",
      "not a uuid": "?game=mtg&ids=618-1537",
      "upper case": `?game=mtg&ids=${a.toUpperCase()}`,
      unsorted: `?game=mtg&ids=${[c, a, b].join(",")}`,
      "a duplicate": `?game=mtg&ids=${[a, a, b].join(",")}`,
      "a trailing comma": `?game=mtg&ids=${a},`,
      "an extra parameter": `?game=mtg&ids=${a}&v=2`,
      "another order": `?ids=${a}&game=mtg`,
      "game twice": `?game=mtg&game=mtg&ids=${a}`,
      "201 ids": `?game=mtg&ids=${Array.from(
        { length: 201 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ).join(",")}`,
    };
    for (const [label, search] of Object.entries(cases)) {
      const { res } = await get(search);
      expect(res.status, label).toBe(400);
      expect(res.headers.get("cache-control"), label).toBeNull();
    }
    expect(statements).toHaveLength(0);
  });

  it("a game without a bracket read answers 400 — One Piece is an API caller, no apology", async () => {
    const { res, body } = await get(`?game=optcg&ids=${IDS.join(",")}`);
    expect(res.status).toBe(400);
    expect(body.error).toBe("No bracket read for this game");
    expect(statements).toHaveLength(0);
  });

  it("200 ids — the cap — is one set like any other; an id set with no combos is an empty list, still cached", async () => {
    const ids = Array.from(
      { length: 200 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    answers = [[], runRows];
    const { res, body } = await get(`?game=mtg&ids=${ids.join(",")}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CACHE);
    expect(body.combos).toEqual([]);
    expect(statements[0].params).toHaveLength(200);
  });
});
