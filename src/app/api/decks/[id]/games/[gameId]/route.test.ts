// @vitest-environment node
/**
 * /api/decks/[id]/games/[gameId] (Y9a, WAVE4 D10): PATCH changes a game's
 * details — never its version or list — with the adapter's checks over the
 * whole game after the change; DELETE (the toast's Undo) removes the game
 * and, under the deck lock, the played snapshot it was played with when no
 * other game uses it — a saved version is never touched. Real drizzle
 * builders over a fake postgres.js client, as in ../route.test.ts.
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
  begin: async (fn: (client: unknown) => Promise<unknown>) => fn(fakeClient),
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

const { PATCH, DELETE } = await import("./route");

const OWNER = "0b5a4f8e-1111-4222-8333-944445555666";
const DECK = "33333333-3333-4333-8333-333333333333";

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
    hiddenTokens: null,
    preconDeckId: null,
    ownsPrecon: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...over,
  };
  return COLUMNS.map((c) => deck[c]);
}

function gameRow(over: Record<string, unknown> = {}): unknown[] {
  const g: Record<string, unknown> = {
    id: 41,
    version: 7,
    playedOn: "2026-10-10",
    podSize: 4,
    result: "win",
    endTurn: 8,
    tableLevel: 3,
    seat: 4,
    opponents: null,
    notes: "gg",
    createdAt: "2026-10-10T20:00:00.000Z",
    ...over,
  };
  return [
    g.id,
    g.version,
    g.playedOn,
    g.podSize,
    g.result,
    g.endTurn,
    g.tableLevel,
    g.seat,
    g.opponents,
    g.notes,
    g.createdAt,
  ];
}

const ctx = (gameId = "41") => ({ params: Promise.resolve({ id: DECK, gameId }) });
function patch(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/decks/${DECK}/games/41`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const del = () =>
  new NextRequest(`http://localhost:3000/api/decks/${DECK}/games/41`, { method: "DELETE" });

beforeEach(() => {
  statements = [];
  answers = [];
  session.userId = OWNER;
  limiter.calls = [];
  limiter.answer = null;
});

describe("PATCH — the details, never the list", () => {
  it("merges the change over the stored game and writes every detail column, never version or list_hash", async () => {
    // deck · the game · update returning
    answers = [[deckRow()], [gameRow()], [gameRow({ result: "loss" })]];
    const res = await PATCH(patch({ result: "loss" }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).game).toMatchObject({ id: 41, result: "loss", version: 7 });
    expect(limiter.calls).toEqual([[`games:user:${OWNER}`, `games:user-day:${OWNER}`]]);
    const update = statements.find((s) => s.sql.startsWith('update "deck_games"'))!;
    const set = update.sql.split(" where ")[0];
    expect(set).not.toMatch(/"version"|"list_hash"|"deck_id"/);
    expect(update.sql).toMatch(
      /where \("deck_games"\."id" = \$\d+ and "deck_games"\."deck_id" = \$\d+\)/,
    );
    expect(update.params).toContain("loss");
    expect(update.params).toContain("gg");
  });

  it("the adapter's checks run over the whole game after the change", async () => {
    // Stored: seat 4 at a 4-player table. Shrinking the pod to 3 leaves seat 4 behind.
    answers = [[deckRow()], [gameRow()]];
    const res = await PATCH(patch({ podSize: 3 }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Seat must be 1 to 3");
    // …clearing the seat with it is fine.
    statements = [];
    answers = [[deckRow()], [gameRow()], [gameRow({ podSize: 3, seat: null })]];
    expect((await PATCH(patch({ podSize: 3, seat: null }), ctx())).status).toBe(200);
  });

  it("null clears a detail; an empty body, a version or a bad id is refused", async () => {
    answers = [[deckRow()], [gameRow()], [gameRow({ endTurn: null })]];
    expect((await PATCH(patch({ endTurn: null }), ctx())).status).toBe(200);
    // The stored turn (8) is cleared — bound as NULL — while the other details stay.
    const cleared = statements.find((s) => s.sql.startsWith('update "deck_games"'))!;
    const columns = cleared.sql
      .split(" where ")[0]
      .replace(/^update "deck_games" set /, "")
      .split(", ")
      .map((part) => part.split(" = "));
    const bound = (column: string) => {
      const placeholder = columns.find(([c]) => c === `"${column}"`)![1];
      return cleared.params[Number(placeholder.slice(1)) - 1];
    };
    expect(bound("end_turn")).toBeNull();
    expect(bound("seat")).toBe(4);
    expect(bound("notes")).toBe("gg");
    statements = [];
    for (const body of [{}, { version: 3 }, { listHash: "h1:x" }]) {
      answers = [[deckRow()]];
      expect((await PATCH(patch(body), ctx())).status, JSON.stringify(body)).toBe(400);
    }
    statements = [];
    limiter.calls = [];
    expect((await PATCH(patch({ result: "win" }), ctx("abc"))).status).toBe(404);
    expect(limiter.calls).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("a game of another deck is 404", async () => {
    answers = [[deckRow()], []];
    expect((await PATCH(patch({ result: "draw" }), ctx())).status).toBe(404);
    expect(statements.some((s) => s.sql.startsWith("update"))).toBe(false);
  });

  it("signed out → 401; a guest deck → 400", async () => {
    session.userId = null;
    expect((await PATCH(patch({ result: "draw" }), ctx())).status).toBe(401);
    session.userId = OWNER;
    const token = "5f2c8a7e-0000-4000-8000-00000000abcd";
    answers = [[deckRow({ userId: null, claimToken: token })]];
    const r = patch({ result: "draw" });
    r.headers.set("x-deck-token", token);
    expect((await PATCH(r, ctx())).status).toBe(400);
  });
});

describe("DELETE — the game, and a played snapshot with its last game", () => {
  it("under the deck lock: the game, then its version only if played and unused", async () => {
    // deck · lock · delete game (returns version 7) · delete played snapshot (returns it)
    answers = [[deckRow()], [[DECK]], [[7]], [[7]]];
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, snapshotRemoved: true });
    expect(statements[1].sql).toMatch(/for update$/);
    expect(statements[2].sql).toMatch(
      /^delete from "deck_games" where \("deck_games"\."id" = \$1 and "deck_games"\."deck_id" = \$2\) returning "version"$/,
    );
    const snapshot = statements[3];
    expect(snapshot.sql).toMatch(/^delete from "deck_versions" where/);
    expect(snapshot.sql).toMatch(/"deck_versions"\."kind" = \$\d+/);
    expect(snapshot.params).toContain("played");
    expect(snapshot.sql).toMatch(
      /not exists \(select 1 from "deck_games" where "deck_games"\."deck_id" = \$\d+ and "deck_games"\."version" = \$\d+\)/,
    );
  });

  it("another game on the same list — or a saved version — keeps the snapshot", async () => {
    answers = [[deckRow()], [[DECK]], [[7]], []];
    expect(await (await DELETE(del(), ctx())).json()).toEqual({
      deleted: true,
      snapshotRemoved: false,
    });
  });

  it("a game logged at the allowance (no version) deletes alone", async () => {
    answers = [[deckRow()], [[DECK]], [[null]]];
    expect(await (await DELETE(del(), ctx())).json()).toEqual({
      deleted: true,
      snapshotRemoved: false,
    });
    expect(statements.filter((s) => s.sql.startsWith("delete"))).toHaveLength(1);
  });

  it("no such game on this deck → 404; someone else's deck → 403", async () => {
    answers = [[deckRow()], [[DECK]], []];
    expect((await DELETE(del(), ctx())).status).toBe(404);
    session.userId = "99999999-9999-4999-8999-999999999999";
    statements = [];
    answers = [[deckRow()]];
    expect((await DELETE(del(), ctx())).status).toBe(403);
    expect(statements.filter((s) => s.sql.startsWith("delete"))).toEqual([]);
  });
});
