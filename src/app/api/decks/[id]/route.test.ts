// @vitest-environment node
/**
 * /api/decks/[id] and goals (Y4b, WAVE4 D5): the goals PATCH — its own body
 * `{goals}`, checked against the deck's adapter, never moving updated_at
 * unless another key rides along — and what the deck GET hands a visitor.
 * Through the REAL drizzle builders over a fake postgres.js client (the
 * X2/X3/X5 route-test pattern), so the statements asserted are the route's
 * own. The session and the limiter are mocked at their module seams.
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

const limiter = { calls: [] as string[][], answer: null as NextResponse | null };
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: async (limits: { key: string }[]) => {
    limiter.calls.push(limits.map((l) => l.key));
    return limiter.answer;
  },
}));

const { GET, PATCH } = await import("./route");

const OWNER = "0b5a4f8e-1111-4222-8333-944445555666";
const DECK = "33333333-3333-4333-8333-333333333333";
const UPDATED = "2026-10-01T12:00:00.000Z";

/** A decks row in the schema's select order — the fake client answers positionally. */
const COLUMNS = Object.keys(getTableColumns(schema.decks)) as (keyof DeckRow)[];
function deckRow(over: Partial<Record<keyof DeckRow, unknown>> = {}): unknown[] {
  const deck: Record<string, unknown> = {
    id: DECK,
    publicId: "abcdefgh2345",
    gameId: GAME_ID.mtg,
    formatId: 1,
    userId: OWNER,
    claimToken: null,
    createdIp: null,
    name: "Atraxa Superfriends",
    description: null,
    notes: null,
    visibility: "public",
    kind: "user",
    leaderIds: [],
    ciMask: 0,
    folderId: null,
    forkedFromDeckId: null,
    currentVersion: 3,
    likesCount: 0,
    goals: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: UPDATED,
    ...over,
  };
  return COLUMNS.map((c) => deck[c]);
}

function patch(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/decks/${DECK}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: DECK }) };
const updates = () => statements.filter((s) => s.sql.startsWith("update"));

beforeEach(() => {
  statements = [];
  answers = [];
  session.userId = OWNER;
  limiter.calls = [];
  limiter.answer = null;
});

describe("PATCH {goals} (Y4b)", () => {
  const goals = { v: 1, targetLevel: 2, answers: { rulesetVersion: 1, play: { fast: "no" } } };

  it("a goals-only body sets goals and nothing else — updated_at stays where it was", async () => {
    answers = [[deckRow()], [deckRow({ goals })]];
    const res = await PATCH(patch({ goals }), ctx);
    expect(res.status).toBe(200);
    const [write] = updates();
    expect(write.sql).toMatch(/^update "decks" set "goals" = \$1 where "decks"\."id" = \$2/);
    expect(write.sql).not.toContain('"updated_at" =');
    expect(JSON.parse(String(write.params[0]))).toEqual(goals);
    const json = await res.json();
    expect(json.deck.goals).toEqual(goals);
    expect(json.deck.updatedAt).toBe(UPDATED);
  });

  it("the same per-deck bucket as the meta PATCH, checked before anything else", async () => {
    limiter.answer = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const res = await PATCH(patch({ goals }), ctx);
    expect(res.status).toBe(429);
    expect(limiter.calls).toEqual([[`deck-meta:deck:${DECK}`, "deck-meta:ip:unknown"]]);
    expect(statements).toEqual([]);
  });

  it("a meta key alongside goals moves updated_at, as every meta PATCH always has", async () => {
    answers = [[deckRow()], [deckRow()]];
    await PATCH(patch({ name: "Renamed", goals }), ctx);
    const [write] = updates();
    expect(write.sql).toMatch(
      /^update "decks" set "name" = \$1, "goals" = \$2, "updated_at" = \$3/,
    );
  });

  it("a meta-only body is unchanged: updated_at moves, goals are untouched", async () => {
    answers = [[deckRow()], [deckRow()]];
    await PATCH(patch({ name: "Renamed" }), ctx);
    const [write] = updates();
    expect(write.sql).toMatch(/^update "decks" set "name" = \$1, "updated_at" = \$2 where/);
    expect(write.sql.split(" where ")[0]).not.toContain('"goals"');
  });

  it("null clears; goals that say nothing are stored as null", async () => {
    answers = [[deckRow({ goals })], [deckRow()]];
    await PATCH(patch({ goals: null }), ctx);
    expect(updates()[0].params[0]).toBeNull();

    statements = [];
    answers = [[deckRow({ goals })], [deckRow()]];
    await PATCH(patch({ goals: { v: 1, answers: { rulesetVersion: 1, play: {} } } }), ctx);
    expect(updates()[0].params[0]).toBeNull();
  });

  it("Magic's range is 1–5; anything else answers 400 and writes nothing", async () => {
    for (const bad of [{ v: 1, targetLevel: 6 }, { v: 1, targetLevel: 0 }, { v: 2 }]) {
      answers = [[deckRow()]];
      const res = await PATCH(patch({ goals: bad }), ctx);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(updates()).toEqual([]);
  });

  it("One Piece declares no brackets: a target answers 400", async () => {
    answers = [[deckRow({ gameId: GAME_ID.optcg, formatId: 3 })]];
    const res = await PATCH(patch({ goals: { v: 1, targetLevel: 2 } }), ctx);
    expect(res.status).toBe(400);
    expect(updates()).toEqual([]);
  });

  it("someone else's deck is 403 before the body is checked", async () => {
    session.userId = "99999999-9999-4999-8999-999999999999";
    answers = [[deckRow()]];
    const res = await PATCH(patch({ goals }), ctx);
    expect(res.status).toBe(403);
    expect(updates()).toEqual([]);
  });

  it("a guest deck takes goals with its edit key, the same way", async () => {
    session.userId = null;
    const token = "5f2c8a7e-0000-4000-8000-00000000abcd";
    answers = [[deckRow({ userId: null, claimToken: token })], [deckRow({ userId: null, goals })]];
    const req = patch({ goals });
    req.headers.set("x-deck-token", token);
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(updates()[0].sql).not.toContain('"updated_at" =');
  });
});

describe("GET — what a visitor sees of the goals", () => {
  const goals = {
    v: 1,
    targetLevel: 2,
    exceptions: "One thematic Game Changer — ask me",
    budget: { perCardUsd: 5 },
    answers: { rulesetVersion: 1, calls: { "combo:618-1537": "yes" } },
  };
  const get = () => new NextRequest(`http://localhost:3000/api/decks/${DECK}`);

  it("a visitor: the target and the exceptions, never the budget or the answers", async () => {
    session.userId = null;
    answers = [[deckRow({ goals })]];
    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deck.isOwner).toBe(false);
    expect(json.deck.goals).toEqual({ v: 1, targetLevel: 2, exceptions: goals.exceptions });
  });

  it("the owner: everything", async () => {
    answers = [[deckRow({ goals })]];
    const json = await (await GET(get(), ctx)).json();
    expect(json.deck.isOwner).toBe(true);
    expect(json.deck.goals).toEqual(goals);
  });
});
