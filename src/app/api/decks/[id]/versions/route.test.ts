// @vitest-environment node
/**
 * GET /api/decks/[id]/versions (Y10, WAVE4 D10): each version carries the
 * games played with it — History's "Played 3 · 2–1" — from the journal's
 * one grouped count, and the response names the newest version's
 * playable-list hash so the dialog can hash the screen and say "No card
 * changes since vN". A newest version from before the hash is hashed here
 * and never stamped (a GET writes nothing). Real drizzle builders over a
 * fake postgres.js client that answers by statement (the reads run side
 * by side).
 */
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";
import type { FrozenCard } from "@/lib/decks/diff";
import { playableListHash } from "@/lib/decks/list-hash";
import type { DeckRow } from "@/lib/decks/serialize";

interface Statement {
  sql: string;
  params: unknown[];
}
let statements: Statement[] = [];
let answer: (sql: string) => unknown[][] = () => [];
const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[]) {
    statements.push({ sql, params });
    const rows = answer(sql);
    return { values: async () => rows, then: undefined };
  },
  begin: async (fn: (client: unknown) => Promise<unknown>) => fn(fakeClient),
};
const fakeDb = drizzle(fakeClient as never, { schema });
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));
const OWNER = "0b5a4f8e-1111-4222-8333-944445555666";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => OWNER }));

const { GET } = await import("./route");

const DECK = "33333333-3333-4333-8333-333333333333";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COLUMNS = Object.keys(getTableColumns(schema.decks)) as (keyof DeckRow)[];
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
};
const deckRow = COLUMNS.map((c) => deck[c]);
const LIVE: FrozenCard[] = [
  { cardId: U(1), zone: "commander", qty: 1, tags: [], printingId: null },
  { cardId: U(2), zone: "main", qty: 2, tags: ["Ramp"], printingId: null },
];
const AT = "2026-10-10T20:00:00.000Z";

/** Answers by statement: the deck, the versions list, the journal's counts, one version's cards. */
function answers(rows: {
  versions: unknown[][];
  cells: unknown[][];
  detail?: unknown[][];
}): (sql: string) => unknown[][] {
  return (sql) => {
    if (sql.includes('from "decks"')) return [deckRow];
    if (sql.includes("group by")) return rows.cells;
    if (sql.includes("jsonb_array_elements")) return rows.versions;
    if (sql.includes('from "deck_versions"')) return rows.detail ?? [];
    return [];
  };
}
const get = async () =>
  GET(new NextRequest(`http://localhost:3000/api/decks/${DECK}/versions`), {
    params: Promise.resolve({ id: DECK }),
  });

beforeEach(() => {
  statements = [];
  answer = () => [];
});

describe("GET versions (Y10)", () => {
  it("each version's record from one grouped count; the newest version's hash; no per-row hash on the wire", async () => {
    answer = answers({
      versions: [
        [3, "Played Oct 10, 2026", "played", AT, 100, "h1:aaa"],
        [2, "post-FNM", "saved", AT, 100, "h1:bbb"],
        [1, null, "saved", AT, 99, "h1:ccc"],
      ],
      cells: [
        [3, 4, "win", 2],
        [3, 3, "loss", 1],
        [2, 4, "draw", 1],
        [null, 4, "win", 1],
      ],
    });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json.versions.map((v: { record: unknown }) => v.record)).toEqual([
      { games: 3, win: 2, loss: 1, draw: 0 },
      { games: 1, win: 0, loss: 0, draw: 1 },
      null,
    ]);
    expect(Object.keys(json.versions[0])).toEqual([
      "version",
      "note",
      "kind",
      "createdAt",
      "cardCount",
      "record",
    ]);
    expect(json).toMatchObject({
      currentVersion: 3,
      cap: 50,
      playedAllowance: 100,
      latestListHash: "h1:aaa",
    });
    // The deck, the versions list, the counts — and nothing written.
    expect(statements).toHaveLength(3);
    const cells = statements.find((s) => s.sql.includes("group by"))!;
    expect(cells.sql).toMatch(/from "deck_games" where "deck_games"\."deck_id" = \$1 group by/);
    expect(cells.params).toEqual([DECK]);
  });

  it("a newest version from before the hash is hashed here from its cards — never stamped", async () => {
    answer = answers({
      versions: [[1, null, "saved", AT, 3, null]],
      cells: [],
      detail: [[1, null, "saved", AT, LIVE]],
    });
    const json = await (await get()).json();
    expect(json.latestListHash).toBe(playableListHash(LIVE));
    expect(json.versions[0].record).toBeNull();
    expect(statements.some((s) => /^(update|insert|delete)/.test(s.sql))).toBe(false);
    expect(statements).toHaveLength(4);
  });

  it("an older hash prefix counts as unhashed too", async () => {
    answer = answers({
      versions: [[2, null, "saved", AT, 3, "h0:old"]],
      cells: [],
      detail: [[2, null, "saved", AT, LIVE]],
    });
    expect((await (await get()).json()).latestListHash).toBe(playableListHash(LIVE));
  });

  it("no versions: no hash, and only the two reads", async () => {
    answer = answers({ versions: [], cells: [] });
    const json = await (await get()).json();
    expect(json).toMatchObject({ versions: [], latestListHash: null });
    expect(statements).toHaveLength(3);
  });
});
