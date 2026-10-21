// @vitest-environment node
/**
 * The deck preview's data read (S8, SECURITY-AUDIT-report.md I9), run over
 * the REAL drizzle builders and a fake postgres.js client that records every
 * statement and answers the deck lookup: a private deck is one statement —
 * the visibility row — and nothing from deck_cards or card_identities; a
 * public deck reads the row, then its cards and its leaders; an unknown id
 * is the lookup alone; a malformed id never reaches the database.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

type Call = { sql: string; params: unknown[] };
let calls: Call[] = [];
/** The row the decks lookup answers, in the select's column order; null = no row. */
let deckRow: unknown[] | null = null;

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    const rows = sql.includes('from "decks"') && deckRow ? [deckRow] : [];
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const { loadDeckOgData } = await import("./data");

const DECK_ID = "44444444-4444-4444-8444-444444444444";
const LEADER = "55555555-5555-4555-8555-555555555555";
const row = (visibility: string) => [
  DECK_ID,
  "Azusa, Lost but Seeking",
  visibility,
  1,
  [LEADER],
  3,
];

beforeEach(() => {
  calls = [];
  deckRow = null;
});

describe("loadDeckOgData", () => {
  it("a private deck: the visibility row and nothing more", async () => {
    deckRow = row("private");
    expect(await loadDeckOgData("abcdefgh2345")).toEqual({ visibility: "private" });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/from "decks" where "decks"\."public_id" = \$1 limit \$2/);
    expect(calls[0].params).toEqual(["abcdefgh2345", 1]);
  });

  it("a public deck: the row, then its cards and its leaders", async () => {
    deckRow = row("public");
    const data = await loadDeckOgData("abcdefgh2345");
    expect(data).toMatchObject({
      name: "Azusa, Lost but Seeking",
      visibility: "public",
      gameId: 1,
      cardCount: 0,
      priceUsd: null,
      commanderNames: [],
      commanderId: LEADER,
      targetLevel: 3,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0].sql).toContain('from "decks"');
    const rest = calls.slice(1).map((c) => c.sql);
    expect(rest.some((sql) => /from "deck_cards" inner join "card_identities"/.test(sql))).toBe(
      true,
    );
    expect(
      rest.some((sql) => /from "card_identities" where "card_identities"\."id" in/.test(sql)),
    ).toBe(true);
    const cards = calls.find((c) => c.sql.includes('from "deck_cards"'));
    expect(cards?.params).toEqual([DECK_ID]);
  });

  it("an unlisted deck reads like a public one (unlisted means unlisted, not secret)", async () => {
    deckRow = row("unlisted");
    expect(await loadDeckOgData("abcdefgh2345")).toMatchObject({ visibility: "unlisted" });
    expect(calls).toHaveLength(3);
  });

  it("an unknown id: the lookup alone, null", async () => {
    expect(await loadDeckOgData("abcdefgh2345")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("a malformed id never reaches the database", async () => {
    for (const bad of ["ab", "ABCDEFGH", "a".repeat(33), "abc-def-ghi", "abc;drop"]) {
      expect(await loadDeckOgData(bad)).toBeNull();
    }
    expect(calls).toEqual([]);
  });
});
