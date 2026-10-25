// @vitest-environment node
/**
 * POST /api/decks and goals (Y4b, WAVE4 D5): a draft whose first real edit
 * is a target or an answer carries its goals in the create · one request —
 * checked against the game's adapter. Through the REAL drizzle builders
 * over a fake postgres.js client (the X5 pattern); the session and the
 * limiter are mocked at their module seams.
 */
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";
import type { DeckRow } from "@/lib/decks/serialize";

interface Statement {
  sql: string;
  params: unknown[];
}
let statements: Statement[] = [];
let answers: unknown[][][] = [];
/** PRECON-OWNED: rows answered by the statement's text, ahead of the positional queue. */
let routed: { match: RegExp; rows: unknown[][] }[] = [];

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[]) {
    statements.push({ sql, params });
    const rows = routed.find((r) => r.match.test(sql))?.rows ?? answers.shift() ?? [];
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

vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: async () => null as NextResponse | null,
}));

const { POST } = await import("./route");

const COLUMNS = Object.keys(getTableColumns(schema.decks)) as (keyof DeckRow)[];
function deckRow(over: Partial<Record<keyof DeckRow, unknown>> = {}): unknown[] {
  const deck: Record<string, unknown> = {
    id: "33333333-3333-4333-8333-333333333333",
    publicId: "abcdefgh2345",
    gameId: GAME_ID.mtg,
    formatId: 1,
    userId: null,
    claimToken: "5f2c8a7e-0000-4000-8000-00000000abcd",
    createdIp: null,
    name: "Untitled",
    description: null,
    notes: null,
    visibility: "unlisted",
    kind: "user",
    leaderIds: [],
    ciMask: 0,
    folderId: null,
    forkedFromDeckId: null,
    currentVersion: 0,
    likesCount: 0,
    goals: null,
    hiddenTokens: null,
    preconDeckId: null,
    ownsPrecon: null,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    ...over,
  };
  return COLUMNS.map((c) => deck[c]);
}

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/decks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const inserts = () => statements.filter((s) => s.sql.startsWith("insert"));
/** The value an insert sent for one column, by the column's name in the SQL's list. */
function inserted(column: string): unknown {
  const [write] = inserts();
  const columns = /^insert into "decks" \(([^)]*)\)/.exec(write.sql)![1].split(", ");
  const at = columns.indexOf(`"${column}"`);
  if (at === -1) return undefined;
  const placeholders = /values \(([^)]*)\)/.exec(write.sql)![1].split(", ");
  const param = /^\$(\d+)$/.exec(placeholders[at]);
  return param ? write.params[Number(param[1]) - 1] : placeholders[at];
}

beforeEach(() => {
  statements = [];
  answers = [];
  routed = [];
  session.userId = null;
});

describe("POST /api/decks with goals (Y4b)", () => {
  const draft = { game: "mtg", format: "commander", name: "Witherbloom Pestilence", website: "" };

  it("a draft's target rides the create: one insert carrying the goals", async () => {
    const goals = { v: 1, targetLevel: 2 };
    answers = [[deckRow({ goals })]];
    const res = await POST(post({ ...draft, goals }));
    expect(res.status).toBe(201);
    expect(inserts()).toHaveLength(1);
    expect(JSON.parse(String(inserted("goals")))).toEqual(goals);
    expect((await res.json()).deck.goals).toEqual(goals);
  });

  it("no goals (or null): the insert names no goals column — the default NULL", async () => {
    for (const body of [draft, { ...draft, goals: null }]) {
      statements = [];
      answers = [[deckRow()]];
      expect((await POST(post(body))).status).toBe(201);
      expect(inserted("goals")).toBe("default");
    }
  });

  it("goals that say nothing are stored as none", async () => {
    answers = [[deckRow()]];
    await POST(post({ ...draft, goals: { v: 1, answers: { rulesetVersion: 1, calls: {} } } }));
    expect(inserted("goals")).toBe("default");
  });

  it("checked against the game: Magic's range, and One Piece takes no target — 400, nothing inserted", async () => {
    for (const body of [
      { ...draft, goals: { v: 1, targetLevel: 9 } },
      { ...draft, goals: "Bracket 2" },
      { game: "optcg", format: "standard", website: "", goals: { v: 1, targetLevel: 2 } },
    ]) {
      const res = await POST(post(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(inserts()).toEqual([]);
  });

  it("the body contract (S8, I2): not JSON and a refused body are 400s under no-store, nothing inserted", async () => {
    const raw = new NextRequest("http://localhost:3000/api/decks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const notJson = await POST(raw);
    expect(notJson.status).toBe(400);
    expect(notJson.headers.get("cache-control")).toBe("no-store");
    expect(await notJson.json()).toEqual({ error: "Body must be JSON" });

    const refused = await POST(post({ ...draft, game: "chess" }));
    expect(refused.status).toBe(400);
    expect(refused.headers.get("cache-control")).toBe("no-store");
    const body = (await refused.json()) as { error: string; issues: { path: unknown[] }[] };
    expect(body.error).toBe("Invalid body");
    expect(body.issues.map((i) => i.path)).toEqual([["game"]]);
    expect(inserts()).toEqual([]);
  });

  it("the honeypot still answers before goals are read", async () => {
    const res = await POST(post({ ...draft, website: "spam", goals: { v: 1, targetLevel: 9 } }));
    expect(res.status).toBe(201);
    expect(statements).toEqual([]);
  });
});

describe("POST /api/decks with fromPrecon (PRECON-OWNED)", () => {
  const PRECON = "55555555-5555-4555-8555-555555555555";
  const draft = { game: "mtg", format: "commander", name: "Breed Lethality", website: "" };
  /** loadPreconBySlug's row: the precon's decks columns, then the product's six fields. */
  const preconLookup = (over: Partial<Record<keyof DeckRow, unknown>> = {}) => [
    [
      ...deckRow({
        id: PRECON,
        publicId: "p_breed_lethality_c16",
        kind: "precon",
        claimToken: null,
        name: "Breed Lethality",
        visibility: "public",
        ...over,
      }),
      "breed_lethality_c16",
      "BreedLethality_C16",
      "C16",
      "Commander 2016",
      "2016-11-11",
      "Breed Lethality",
    ],
  ];
  const lookups = () => statements.filter((s) => s.sql.includes('from "precon_products"'));

  it("a valid slug: one lookup, then one insert carrying the precon's deck id — no answer yet", async () => {
    routed = [{ match: /from "precon_products"/, rows: preconLookup() }];
    answers = [[deckRow({ preconDeckId: PRECON })]];
    const res = await POST(post({ ...draft, fromPrecon: "breed_lethality_c16" }));
    expect(res.status).toBe(201);
    expect(lookups()).toHaveLength(1);
    expect(lookups()[0].params).toContain("breed_lethality_c16");
    expect(inserts()).toHaveLength(1);
    expect(inserted("precon_deck_id")).toBe(PRECON);
    expect(inserted("owns_precon")).toBe("default");
  });

  it("an answer given before the mint rides the create; null says nothing", async () => {
    for (const ownsPrecon of [true, false]) {
      statements = [];
      routed = [{ match: /from "precon_products"/, rows: preconLookup() }];
      answers = [[deckRow({ preconDeckId: PRECON, ownsPrecon })]];
      const res = await POST(post({ ...draft, fromPrecon: "breed_lethality_c16", ownsPrecon }));
      expect(res.status).toBe(201);
      expect(inserted("owns_precon")).toBe(ownsPrecon);
    }
    statements = [];
    answers = [[deckRow({ preconDeckId: PRECON })]];
    await POST(post({ ...draft, fromPrecon: "breed_lethality_c16", ownsPrecon: null }));
    expect(inserted("owns_precon")).toBe("default");
  });

  it("the create's wire never names the lineage or the answer", async () => {
    routed = [{ match: /from "precon_products"/, rows: preconLookup() }];
    answers = [[deckRow({ preconDeckId: PRECON, ownsPrecon: true })]];
    const res = await POST(post({ ...draft, fromPrecon: "breed_lethality_c16", ownsPrecon: true }));
    const text = await res.text();
    expect(text).not.toContain(PRECON);
    expect(text).not.toMatch(/"precon"|preconDeckId|ownsPrecon/);
  });

  it("an unknown slug: 400, nothing inserted", async () => {
    routed = [{ match: /from "precon_products"/, rows: [] }];
    const res = await POST(post({ ...draft, fromPrecon: "no_such_precon" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "Unknown precon" });
    expect(inserts()).toEqual([]);
  });

  it("a precon of another game or format: 400, nothing inserted", async () => {
    routed = [{ match: /from "precon_products"/, rows: preconLookup() }];
    const res = await POST(
      post({ game: "optcg", format: "standard", website: "", fromPrecon: "breed_lethality_c16" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That precon is for another game or format" });
    routed = [{ match: /from "precon_products"/, rows: preconLookup({ formatId: 2 }) }];
    expect((await POST(post({ ...draft, fromPrecon: "breed_lethality_c16" }))).status).toBe(400);
    expect(inserts()).toEqual([]);
  });

  it("the slug's grammar, and an answer with no precon: 400 before any lookup", async () => {
    for (const body of [
      { ...draft, fromPrecon: "BreedLethality_C16" },
      { ...draft, fromPrecon: "x" },
      { ...draft, ownsPrecon: true },
      { ...draft, ownsPrecon: false },
      { ...draft, fromPrecon: "breed_lethality_c16", ownsPrecon: "yes" },
    ]) {
      const res = await POST(post(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(lookups()).toEqual([]);
    expect(inserts()).toEqual([]);
  });

  it("without fromPrecon the create is what it was: no lookup, neither column named", async () => {
    answers = [[deckRow()]];
    expect((await POST(post(draft))).status).toBe(201);
    expect(lookups()).toEqual([]);
    expect(inserted("precon_deck_id")).toBe("default");
    expect(inserted("owns_precon")).toBe("default");
  });
});
