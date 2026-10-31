// @vitest-environment node
/**
 * forkDeck (P3.6) and goals (Y4b, WAVE4 D5): a fork never copies the
 * upstream's goals — its insert names explicit columns, so `goals` falls to
 * the column default (NULL) by construction. Through the REAL drizzle
 * builders over a fake postgres.js client (the route tests' pattern), with
 * `begin` running the transaction on the same client. And forkCredit (the
 * 2026-10-30 security audit's fork-credit record): a public fork never hands
 * a stranger an unlisted upstream's link.
 */
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";

import type { DeckRow } from "./serialize";

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

const { forkCredit, forkDeck } = await import("./forks");

const UPSTREAM = "33333333-3333-4333-8333-333333333333";
const FORK = "44444444-4444-4444-8444-444444444444";
const FORKER = "0b5a4f8e-1111-4222-8333-944445555666";
const goals = {
  v: 1 as const,
  targetLevel: 2,
  exceptions: "Ask me",
  answers: { rulesetVersion: 1, play: { fast: "no" as const } },
};

const COLUMNS = Object.keys(getTableColumns(schema.decks)) as (keyof DeckRow)[];
function deck(over: Partial<DeckRow> = {}): DeckRow {
  return {
    id: UPSTREAM,
    publicId: "abcdefgh2345",
    gameId: GAME_ID.mtg,
    formatId: 1,
    userId: "99999999-9999-4999-8999-999999999999",
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
    currentVersion: 4,
    likesCount: 2,
    goals,
    hiddenTokens: null,
    preconDeckId: null,
    ownsPrecon: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  };
}
const values = (row: DeckRow): unknown[] =>
  COLUMNS.map((c) => (row[c] instanceof Date ? (row[c] as Date).toISOString() : row[c]));

beforeEach(() => {
  statements = [];
  answers = [];
});

describe("forkDeck — goals are never copied (Y4b)", () => {
  it("the fork's insert leaves goals to the column default, whatever the upstream holds", async () => {
    const fork = deck({ id: FORK, userId: FORKER, goals: null, forkedFromDeckId: UPSTREAM });
    // lock · live list · insert · version count · version bump · version insert · re-read
    answers = [[[UPSTREAM]], [], [values(fork)], [[0]], [[1]], [], [values(fork)]];
    const made = await forkDeck(deck(), { userId: FORKER, ip: null });
    expect(made.goals).toBeNull();

    const insert = statements.find((s) => s.sql.startsWith('insert into "decks"'))!;
    const columns = /^insert into "decks" \(([^)]*)\)/.exec(insert.sql)![1].split(", ");
    const placeholders = /values \(([^)]*)\)/.exec(insert.sql)![1].split(", ");
    expect(placeholders[columns.indexOf('"goals"')]).toBe("default");
    expect(JSON.stringify(insert.params)).not.toMatch(/targetLevel|rulesetVersion|Ask me/);
  });
});

describe("forkDeck — the precon lineage (PRECON-OWNED)", () => {
  const PRECON = "55555555-5555-4555-8555-555555555555";
  /** The value the fork's insert sent for one column ("default" = the column default, NULL). */
  async function forkInsert(upstream: DeckRow): Promise<(column: string) => unknown> {
    statements = [];
    const fork = deck({ id: FORK, userId: FORKER, goals: null, forkedFromDeckId: upstream.id });
    answers = [[[upstream.id]], [], [values(fork)], [[0]], [[1]], [], [values(fork)]];
    await forkDeck(upstream, { userId: FORKER, ip: null });
    const insert = statements.find((s) => s.sql.startsWith('insert into "decks"'))!;
    const columns = /^insert into "decks" \(([^)]*)\)/.exec(insert.sql)![1].split(", ");
    const placeholders = /values \(([^)]*)\)/.exec(insert.sql)![1].split(", ");
    return (column) => {
      const at = columns.indexOf(`"${column}"`);
      const param = /^\$(\d+)$/.exec(placeholders[at]);
      return param ? insert.params[Number(param[1]) - 1] : placeholders[at];
    };
  }

  it("a fork of a precon is a deck started from it: precon_deck_id = the precon's id, no answer", async () => {
    const precon = deck({
      id: PRECON,
      kind: "precon",
      userId: null,
      goals: null,
      publicId: "p_breed_lethality_c16",
    });
    const sent = await forkInsert(precon);
    expect(sent("precon_deck_id")).toBe(PRECON);
    expect(sent("owns_precon")).toBe("default");
  });

  it("a fork of a user's deck inherits nothing, even one that started from a precon and owns it", async () => {
    const sent = await forkInsert(deck({ preconDeckId: PRECON, ownsPrecon: true }));
    expect(sent("precon_deck_id")).toBe("default");
    expect(sent("owns_precon")).toBe("default");
  });
});

describe("forkCredit — a public fork never hands a stranger an unlisted upstream's link", () => {
  type Visibility = DeckRow["visibility"];
  const OWNER = "99999999-9999-4999-8999-999999999999";
  const STRANGER = "11111111-1111-4111-8111-111111111111";
  const LINKED = { state: "linked", publicId: "abcdefgh2345", name: "Atraxa Superfriends" };
  const HIDDEN = { state: "private" };
  const VIEWERS = {
    anonymous: { token: null, userId: null },
    stranger: { token: null, userId: STRANGER },
    forker: { token: null, userId: FORKER },
    upstreamOwner: { token: null, userId: OWNER },
  };
  /** forkCredit's one select, positionally: publicId, name, userId, claimToken, visibility. */
  const upstream = (
    visibility: Visibility,
    userId: string | null = OWNER,
    token: string | null = null,
  ) => [["abcdefgh2345", "Atraxa Superfriends", userId, token, visibility]];
  const fork = (visibility: Visibility) =>
    deck({ id: FORK, userId: FORKER, visibility, forkedFromDeckId: UPSTREAM });

  const cases: [Visibility, Visibility, keyof typeof VIEWERS, unknown][] = [
    ["unlisted", "public", "anonymous", HIDDEN],
    ["unlisted", "public", "stranger", HIDDEN],
    ["unlisted", "public", "forker", LINKED],
    ["unlisted", "public", "upstreamOwner", LINKED],
    ["unlisted", "unlisted", "anonymous", LINKED],
    ["unlisted", "unlisted", "stranger", LINKED],
    ["unlisted", "private", "forker", LINKED],
    ["public", "public", "anonymous", LINKED],
    ["public", "unlisted", "anonymous", LINKED],
    ["private", "public", "anonymous", HIDDEN],
    ["private", "public", "forker", HIDDEN],
    ["private", "public", "upstreamOwner", LINKED],
  ];
  it.each(cases)("upstream %s, fork %s, %s", async (up, f, who, want) => {
    answers = [upstream(up)];
    expect(await forkCredit(fork(f), VIEWERS[who])).toEqual(want);
  });

  it("a guest upstream's owner keeps the link where their token is sent", async () => {
    const TOKEN = "22222222-2222-4222-8222-222222222222";
    answers = [upstream("unlisted", null, TOKEN)];
    expect(await forkCredit(fork("public"), { token: TOKEN, userId: null })).toEqual(LINKED);
    answers = [upstream("unlisted", null, TOKEN)];
    expect(await forkCredit(fork("public"), { token: null, userId: null })).toEqual(HIDDEN);
  });

  it("a deck that is no fork asks nothing", async () => {
    expect(await forkCredit(deck(), VIEWERS.anonymous)).toBeNull();
    expect(statements).toEqual([]);
  });
});
