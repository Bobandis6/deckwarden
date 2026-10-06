// @vitest-environment node
/**
 * POST /api/decks and goals (Y4b, WAVE4 D5): a draft whose first real edit
 * is a target or an answer carries its goals in the create — one request —
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

  it("the honeypot still answers before goals are read", async () => {
    const res = await POST(post({ ...draft, website: "spam", goals: { v: 1, targetLevel: 9 } }));
    expect(res.status).toBe(201);
    expect(statements).toEqual([]);
  });
});
