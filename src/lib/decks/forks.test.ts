// @vitest-environment node
/**
 * forkDeck (P3.6) and goals (Y4b, WAVE4 D5): a fork never copies the
 * upstream's goals — its insert names explicit columns, so `goals` falls to
 * the column default (NULL) by construction. Through the REAL drizzle
 * builders over a fake postgres.js client (the route tests' pattern), with
 * `begin` running the transaction on the same client.
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

const { forkDeck } = await import("./forks");

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
