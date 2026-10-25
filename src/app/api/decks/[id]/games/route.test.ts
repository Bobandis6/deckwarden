// @vitest-environment node
/**
 * /api/decks/[id]/games (Y9a, WAVE4 D10): the gate in the contract's order
 * (session 401 → the per-user bucket → 404 / owner 403 → a guest deck 400
 * → zod → the adapter's checks) and POST's one transaction — lock, hash the
 * live list, stamp unhashed versions, reuse the newest version with the
 * hash or mint a played snapshot, insert the game — through the REAL
 * drizzle builders over a fake postgres.js client (the route-test pattern;
 * `begin` runs the transaction on the same client). The session and the
 * limiter are mocked at their module seams.
 */
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { FORMAT_ID, GAME_ID } from "@/db/seed-data";
import { diffDeckLists, diffSummary, type FrozenCard } from "@/lib/decks/diff";
import { playableListHash } from "@/lib/decks/list-hash";
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

/** Drops the adapter's journal declaration for one test — a game without one. */
const registry = { dropJournal: false };
vi.mock("@/lib/games/registry", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/games/registry")>();
  return {
    ...real,
    getAdapter: (id: Parameters<typeof real.getAdapter>[0]) => {
      const adapter = real.getAdapter(id);
      return registry.dropJournal ? { ...adapter, journal: undefined } : adapter;
    },
    // The gate reads the adapter through findAdapter since S8 (I7); same drop.
    findAdapter: (id: Parameters<typeof real.findAdapter>[0]) => {
      const adapter = real.findAdapter(id);
      return adapter && registry.dropJournal ? { ...adapter, journal: undefined } : adapter;
    },
  };
});

const { GET, POST } = await import("./route");

const OWNER = "0b5a4f8e-1111-4222-8333-944445555666";
const DECK = "33333333-3333-4333-8333-333333333333";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...over,
  };
  return COLUMNS.map((c) => deck[c]);
}

/** The live list, as loadLiveFrozen's select answers it (identity, zone, qty, tags, printing). */
const LIVE: FrozenCard[] = [
  { cardId: U(1), zone: "commander", qty: 1, tags: [], printingId: null },
  { cardId: U(2), zone: "main", qty: 1, tags: ["Ramp"], printingId: U(92) },
  { cardId: U(3), zone: "main", qty: 3, tags: [], printingId: null },
];
const liveRows = (list: FrozenCard[]) =>
  list.map((c) => [c.cardId, c.zone, c.qty, c.tags, c.printingId]);
const HASH = playableListHash(LIVE);
const OTHER: FrozenCard[] = [{ ...LIVE[0] }, { ...LIVE[2], qty: 2 }];

/** A deck_games row in GAME_COLUMNS' order, as `returning` answers it. */
function gameRow(over: Record<string, unknown> = {}): unknown[] {
  const g: Record<string, unknown> = {
    id: 41,
    version: 7,
    playedOn: "2026-10-10",
    podSize: 4,
    result: "win",
    endTurn: null,
    tableLevel: null,
    seat: null,
    opponents: null,
    notes: null,
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

function req(method: "GET" | "POST", body?: unknown, raw?: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/decks/${DECK}/games`, {
    method,
    ...(body !== undefined || raw !== undefined
      ? { headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) }
      : {}),
  });
}
const ctx = { params: Promise.resolve({ id: DECK }) };
const inserts = (table: string) =>
  statements.filter((s) => s.sql.startsWith(`insert into "${table}"`));
/** A column's bound value in an insert statement. */
function inserted(stmt: Statement, column: string): unknown {
  const columns = /^insert into "[a-z_]+" \(([^)]*)\)/.exec(stmt.sql)![1].split(", ");
  const values = /values \(([^)]*)\)/.exec(stmt.sql)![1].split(", ");
  const placeholder = values[columns.indexOf(`"${column}"`)];
  return placeholder.startsWith("$") ? stmt.params[Number(placeholder.slice(1)) - 1] : placeholder;
}

beforeEach(() => {
  statements = [];
  answers = [];
  session.userId = OWNER;
  limiter.calls = [];
  limiter.answer = null;
  registry.dropJournal = false;
});

describe("the gate, in the contract's order", () => {
  it("signed out → 401 with the sign-in sentence, before the bucket or any query", async () => {
    session.userId = null;
    for (const res of [await GET(req("GET"), ctx), await POST(req("POST", {}), ctx)]) {
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("Sign in to keep a game journal");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(limiter.calls).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("then the per-user bucket — reads and writes in their own, windows ≤ 1 day", async () => {
    limiter.answer = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    expect((await GET(req("GET"), ctx)).status).toBe(429);
    expect((await POST(req("POST", { result: "win", podSize: 4 }), ctx)).status).toBe(429);
    expect(limiter.calls).toEqual([
      [`games-read:user:${OWNER}`],
      [`games:user:${OWNER}`, `games:user-day:${OWNER}`],
    ]);
    expect(statements).toEqual([]);
  });

  it("an unknown deck is 404; someone else's 403", async () => {
    answers = [[]];
    expect((await GET(req("GET"), ctx)).status).toBe(404);
    session.userId = "99999999-9999-4999-8999-999999999999";
    answers = [[deckRow()]];
    expect((await POST(req("POST", { result: "win", podSize: 4 }), ctx)).status).toBe(403);
    expect(statements.some((s) => s.sql.startsWith("insert"))).toBe(false);
  });

  it("a guest deck — even with its key, signed in — answers 400 'Sign in to keep a game journal'", async () => {
    const token = "5f2c8a7e-0000-4000-8000-00000000abcd";
    answers = [[deckRow({ userId: null, claimToken: token })]];
    const r = req("POST", { result: "win", podSize: 4 });
    r.headers.set("x-deck-token", token);
    const res = await POST(r, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Sign in to keep a game journal");
    expect(statements).toHaveLength(1);
  });

  it("a game without a journal declaration answers 400, before the body is read", async () => {
    registry.dropJournal = true;
    answers = [[deckRow()]];
    const res = await POST(req("POST", { result: "win", podSize: 4 }), ctx);
    registry.dropJournal = false;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This game has no game journal");
    expect(statements).toHaveLength(1);
  });

  it("zod, then the adapter's checks — each a 400 that writes nothing", async () => {
    const bad = [
      { result: "won", podSize: 4 },
      { result: "win" },
      { result: "win", podSize: 4, version: 2 },
      { result: "win", podSize: 9 },
      { result: "win", podSize: 4, seat: 5 },
      { result: "win", podSize: 4, tableLevel: 6 },
      { result: "win", podSize: 4, playedOn: "2999-01-01" },
    ];
    for (const body of bad) {
      answers = [[deckRow()]];
      const res = await POST(req("POST", body), ctx);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    answers = [[deckRow()]];
    expect((await POST(req("POST", undefined, "{not json"), ctx)).status).toBe(400);
    expect(statements.every((s) => s.sql.startsWith("select"))).toBe(true);
  });

  it("One Piece logs 1v1 with went first / second; no table level, no four-player pod", async () => {
    const op = { gameId: GAME_ID.optcg, formatId: FORMAT_ID.optcgStandard };
    for (const body of [
      { result: "win", podSize: 4 },
      { result: "win", podSize: 2, tableLevel: 2 },
      { result: "win", podSize: 2, seat: 3 },
    ]) {
      answers = [[deckRow(op)]];
      expect((await POST(req("POST", body), ctx)).status, JSON.stringify(body)).toBe(400);
    }
    statements = [];
    // deck · lock · live · versions (one, same list) · first? · game insert
    answers = [
      [deckRow(op)],
      [[DECK]],
      liveRows(LIVE),
      [[2, HASH, null]],
      [[40]], // an earlier game: not the first
      [gameRow({ version: 2, podSize: 2, seat: 2 })],
    ];
    const res = await POST(req("POST", { result: "loss", podSize: 2, seat: 2 }), ctx);
    expect(res.status).toBe(201);
    const [game] = inserts("deck_games");
    expect(inserted(game, "pod_size")).toBe(2);
    expect(inserted(game, "seat")).toBe(2);
    expect(inserted(game, "table_level")).toBe(null);
  });
});

describe("POST — the list the game was played with (one transaction)", () => {
  it("an unchanged list reuses the newest version with its hash — no snapshot minted", async () => {
    // deck · lock · live · versions newest first (v7 and v5 share the hash) · first? · game
    answers = [
      [deckRow()],
      [[DECK]],
      liveRows(LIVE),
      [
        [7, HASH, null],
        [6, playableListHash(OTHER), null],
        [5, HASH, null],
      ],
      [[40]], // an earlier game: not the first
      [gameRow({ version: 7 })],
    ];
    const res = await POST(req("POST", { result: "win", podSize: 4, playedOn: "2026-10-10" }), ctx);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json).toMatchObject({ version: 7, minted: false, capped: false, first: false });
    expect(json.game).toMatchObject({ id: 41, version: 7, result: "win", playedOn: "2026-10-10" });
    expect(json.game.listHash).toBeUndefined();

    expect(statements[1].sql).toMatch(/for update$/);
    expect(statements[3].sql).toMatch(/order by "deck_versions"\."version" desc$/);
    expect(inserts("deck_versions")).toEqual([]);
    expect(statements.some((s) => s.sql.startsWith('update "deck_versions"'))).toBe(false);
    const [game] = inserts("deck_games");
    expect(inserted(game, "version")).toBe(7);
    expect(inserted(game, "list_hash")).toBe(HASH);
    expect(inserted(game, "deck_id")).toBe(DECK);
  });

  it("a changed list mints a played snapshot noted 'Played {date}', stamped with the hash", async () => {
    // … versions (none match) · played count · bump · version insert · first? · game
    answers = [
      [deckRow()],
      [[DECK]],
      liveRows(LIVE),
      [[6, playableListHash(OTHER), null]],
      [[3]],
      [[8]],
      [],
      [[40]], // an earlier game: not the first
      [gameRow({ version: 8 })],
    ];
    const res = await POST(req("POST", { result: "win", podSize: 4, playedOn: "2026-10-10" }), ctx);
    expect(await res.json()).toMatchObject({ version: 8, minted: true, capped: false });
    const count = statements[4];
    expect(count.params).toEqual([DECK, "played"]);
    const [version] = inserts("deck_versions");
    expect(inserted(version, "kind")).toBe("played");
    expect(inserted(version, "note")).toBe("Played Oct 10, 2026");
    expect(inserted(version, "list_hash")).toBe(HASH);
    expect(JSON.parse(String(inserted(version, "cards")))).toEqual(LIVE);
    expect(inserted(inserts("deck_games")[0], "version")).toBe(8);
  });

  it("a tag or printing change keeps the hash — the same snapshot is reused", async () => {
    const retagged = LIVE.map((c) => ({ ...c, tags: ["Changed"], printingId: U(99) }));
    answers = [[deckRow()], [[DECK]], liveRows(retagged), [[8, HASH, null]], [[40]], [gameRow()]];
    const res = await POST(req("POST", { result: "draw", podSize: 4 }), ctx);
    expect(await res.json()).toMatchObject({ version: 8, minted: false });
    expect(inserts("deck_versions")).toEqual([]);
  });

  it("the deck's first log hashes its older versions in the same transaction, and reuses one that matches", async () => {
    answers = [
      [deckRow()],
      [[DECK]],
      liveRows(LIVE),
      [
        [4, null, OTHER],
        [3, null, LIVE],
      ],
      [],
      [[40]], // an earlier game: not the first
      [gameRow({ version: 3 })],
    ];
    const res = await POST(req("POST", { result: "win", podSize: 4 }), ctx);
    expect(await res.json()).toMatchObject({ version: 3, minted: false });
    const versionsRead = statements[3];
    expect(versionsRead.sql).toMatch(
      /case when "list_hash" like \$1 then null else "cards" end from "deck_versions"/,
    );
    expect(versionsRead.params[0]).toBe("h1:%");
    const stamp = statements[4];
    expect(stamp.sql).toMatch(
      /^update "deck_versions" set "list_hash" = case "deck_versions"\."version" when \$1 then \$2 when \$3 then \$4 end where/,
    );
    expect(stamp.params.slice(0, 4)).toEqual([4, playableListHash(OTHER), 3, HASH]);
    expect(inserts("deck_versions")).toEqual([]);
  });

  it("at the played allowance the game still logs — version null, the hash kept, capped", async () => {
    answers = [
      [deckRow()],
      [[DECK]],
      liveRows(LIVE),
      [[6, playableListHash(OTHER), null]],
      [[100]],
      [[40]], // an earlier game: not the first
      [gameRow({ version: null })],
    ];
    const res = await POST(req("POST", { result: "loss", podSize: 4 }), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ version: null, minted: false, capped: true });
    expect(inserts("deck_versions")).toEqual([]);
    const [game] = inserts("deck_games");
    expect(inserted(game, "version")).toBe(null);
    expect(inserted(game, "list_hash")).toBe(HASH);
  });

  it("the deck's first game says so (Y10) — read under the lock, just before the insert", async () => {
    answers = [[deckRow()], [[DECK]], liveRows(LIVE), [[7, HASH, null]], [], [gameRow()]];
    const res = await POST(req("POST", { result: "win", podSize: 4 }), ctx);
    expect(await res.json()).toMatchObject({ version: 7, first: true });
    const insertAt = statements.findIndex((s) => s.sql.startsWith('insert into "deck_games"'));
    const prior = statements[insertAt - 1];
    expect(prior.sql).toMatch(
      /^select "id" from "deck_games" where "deck_games"\."deck_id" = \$1 limit \$2$/,
    );
    expect(prior.params).toEqual([DECK, 1]);
    expect(statements[1].sql).toMatch(/for update$/);
  });

  it("the date defaults to the server's UTC today; the details ride along", async () => {
    answers = [[deckRow()], [[DECK]], liveRows(LIVE), [[7, HASH, null]], [[40]], [gameRow()]];
    const before = new Date().toISOString().slice(0, 10);
    await POST(
      req("POST", {
        result: "win",
        podSize: 4,
        endTurn: 9,
        tableLevel: 3,
        seat: 2,
        notes: " gg ",
        opponents: [[U(5)], [U(6), U(7)]],
      }),
      ctx,
    );
    const after = new Date().toISOString().slice(0, 10);
    const [game] = inserts("deck_games");
    expect([before, after]).toContain(inserted(game, "played_on"));
    expect(inserted(game, "end_turn")).toBe(9);
    expect(inserted(game, "table_level")).toBe(3);
    expect(inserted(game, "seat")).toBe(2);
    expect(inserted(game, "notes")).toBe("gg");
    expect(JSON.parse(String(inserted(game, "opponents")))).toEqual([[U(5)], [U(6), U(7)]]);
  });
});

describe("GET — the recent games and the allowance's numerator", () => {
  it("newest first, 50 at most, with the total and the played count in one statement", async () => {
    // deck · games ∥ counts ∥ the record's cells (none: no lists read, no names read)
    answers = [[deckRow()], [gameRow(), gameRow({ id: 40, result: "loss" })], [[12, 3]], []];
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json).toMatchObject({ total: 12, playedSnapshots: 3, playedAllowance: 100 });
    expect(json.games.map((g: { id: number }) => g.id)).toEqual([41, 40]);
    const list = statements.find(
      (s) => s.sql.includes('from "deck_games"') && s.sql.includes("limit"),
    )!;
    expect(list.sql).toMatch(
      /order by "deck_games"\."played_on" desc, "deck_games"\."id" desc limit \$\d+$/,
    );
    expect(list.params).toContain(50);
    expect(statements).toHaveLength(4);
    expect(json).toMatchObject({ record: [], lists: [], names: {} });
    // The deck id is bound in both subqueries — an unqualified "id" there would be the inner table's.
    const counts = statements[2];
    expect(counts.sql).toMatch(
      /^select \(select count\(\*\)::int from "deck_games" where "deck_id" = \$1\), \(select count\(\*\)::int from "deck_versions" where "deck_id" = \$2 and "kind" = 'played'\) from "decks"/,
    );
    expect(counts.params.slice(0, 2)).toEqual([DECK, DECK]);
  });

  it("Y10 — the record: every game counted in ONE grouped statement, the newest lists' diffs from one read, opponents' names from one lookup", async () => {
    const ATRAXA = "d0d33d52-3d28-4635-b985-51e126289259";
    const KRAUM = "0d7b2b7d-2f2c-4d1c-9c8f-4b2a8f9f2e11";
    const UNKNOWN = "1111aaaa-2222-4333-8444-555566667777";
    answers = [
      [deckRow()],
      [
        gameRow({ version: 8, opponents: [[ATRAXA], [KRAUM, UNKNOWN]] }),
        gameRow({ id: 40, version: 5, result: "loss", opponents: [[ATRAXA]] }),
      ],
      [[14, 2]],
      // version · pod · result · games
      [
        [8, 4, "win", 3],
        [8, 3, "loss", 1],
        [5, 4, "loss", 8],
        [null, 4, "win", 2],
      ],
      // the lists' snapshots (v8, v5)
      [
        [8, LIVE],
        [5, OTHER],
      ],
      // the names found (UNKNOWN names no card)
      [
        [ATRAXA, "Atraxa, Praetors' Voice"],
        [KRAUM, "Kraum, Ludevic's Opus"],
      ],
    ];
    const json = await (await GET(req("GET"), ctx)).json();
    expect(json.record).toEqual([
      { version: 8, podSize: 4, result: "win", games: 3 },
      { version: 8, podSize: 3, result: "loss", games: 1 },
      { version: 5, podSize: 4, result: "loss", games: 8 },
      { version: null, podSize: 4, result: "win", games: 2 },
    ]);
    expect(json.lists).toEqual([
      { version: 8, since: 5, change: diffSummary(diffDeckLists(OTHER, LIVE)) },
      { version: 5, since: null, change: null },
    ]);
    expect(json.lists[0].change).toBe("+1, 1 qty");
    expect(json.names).toEqual({
      [ATRAXA]: "Atraxa, Praetors' Voice",
      [KRAUM]: "Kraum, Ludevic's Opus",
    });

    expect(statements).toHaveLength(6);
    const cells = statements[3];
    expect(cells.sql).toBe(
      'select "version", "pod_size", "result", count(*)::int from "deck_games" where "deck_games"."deck_id" = $1 group by "deck_games"."version", "deck_games"."pod_size", "deck_games"."result"',
    );
    expect(cells.params).toEqual([DECK]);
    const lists = statements[4];
    expect(lists.sql).toMatch(
      /^select "version", "cards" from "deck_versions" where \("deck_versions"\."deck_id" = \$1 and "deck_versions"\."version" in \(\$2, \$3\)\)$/,
    );
    expect(lists.params).toEqual([DECK, 8, 5]);
    const names = statements[5];
    expect(names.sql).toMatch(
      /^select "external_key", "name" from "card_identities" where \("card_identities"\."game_id" = \$1 and "card_identities"\."external_key" in \(\$2, \$3, \$4\)\)$/,
    );
    // The deck's own game, each key once.
    expect(names.params).toEqual([GAME_ID.mtg, ATRAXA, KRAUM, UNKNOWN]);
  });

  it("Y10 — past 10 lists: 11 snapshots read, the newest 10 described, the 10th since the 11th", async () => {
    const versions = Array.from({ length: 12 }, (_, i) => 20 - i); // 20 … 9
    answers = [
      [deckRow()],
      [gameRow()],
      [[12, 12]],
      versions.map((v) => [v, 4, "win", 1]),
      versions.slice(0, 11).map((v) => [v, LIVE]),
    ];
    const json = await (await GET(req("GET"), ctx)).json();
    expect(statements[4].params).toEqual([DECK, ...versions.slice(0, 11)]);
    expect(json.lists).toHaveLength(10);
    expect(json.lists[0]).toEqual({ version: 20, since: 19, change: "No card changes" });
    expect(json.lists[9]).toEqual({ version: 11, since: 10, change: "No card changes" });
    // No opponents among the games returned: no names read.
    expect(statements).toHaveLength(5);
  });
});
