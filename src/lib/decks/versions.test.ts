// @vitest-environment node
/**
 * Versions (P3.6) — the pure helpers, and (Y9a, WAVE4 D10) insertVersion's
 * hash stamp and per-kind ceilings plus deleteVersion's in-use refusal,
 * through the REAL drizzle builders over a fake postgres.js client (the
 * route tests' pattern; `begin` runs a transaction on the same client).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

import type { FrozenCard } from "./diff";
import { playableListHash } from "./list-hash";

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

const {
  deleteVersion,
  frozenCount,
  frozenToInputs,
  insertVersion,
  MAX_PLAYED_SNAPSHOTS_PER_DECK,
  MAX_VERSIONS_PER_DECK,
  parseFrozenCards,
  PlayedAllowanceError,
  resolveFrozenCards,
  toFrozenCards,
  VersionCapError,
} = await import("./versions");

beforeEach(() => {
  statements = [];
  answers = [];
});

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("version cap (decision 6)", () => {
  it("is 50 per deck — the disclosed Neon bound, surfaced in the UI when hit", () => {
    expect(MAX_VERSIONS_PER_DECK).toBe(50);
  });

  it("played snapshots have their own allowance of 100 (Y9a, WAVE4 §F)", () => {
    expect(MAX_PLAYED_SNAPSHOTS_PER_DECK).toBe(100);
  });
});

describe("insertVersion — the hash stamp and each kind's ceiling (Y9a)", () => {
  const DECK = "33333333-3333-4333-8333-333333333333";
  const cards: FrozenCard[] = [
    { cardId: U(1), zone: "commander", qty: 1, tags: [], printingId: null },
    { cardId: U(2), zone: "main", qty: 3, tags: ["Ramp"], printingId: U(9) },
  ];
  const tx = () => fakeDb as never;
  const insertParams = () => {
    const insert = statements.find((s) => s.sql.startsWith('insert into "deck_versions"'))!;
    const columns = /^insert into "deck_versions" \(([^)]*)\)/.exec(insert.sql)![1].split(", ");
    const values = /values \(([^)]*)\)/.exec(insert.sql)![1].split(", ");
    const at = (column: string) => {
      const placeholder = values[columns.indexOf(`"${column}"`)];
      return placeholder.startsWith("$")
        ? insert.params[Number(placeholder.slice(1)) - 1]
        : placeholder;
    };
    return { at };
  };

  it("a saved version (the default) is stamped with its playable-list hash and kind 'saved'", async () => {
    // count · bump · insert
    answers = [[[3]], [[8]], []];
    const made = await insertVersion(tx(), DECK, cards, "post-FNM");
    expect(made).toEqual({ version: 8, cardCount: 4 });
    const count = statements[0];
    expect(count.sql).toMatch(/"deck_versions"\."kind" = \$2/);
    expect(count.params).toEqual([DECK, "saved"]);
    const { at } = insertParams();
    expect(at("list_hash")).toBe(playableListHash(cards));
    expect(at("kind")).toBe("saved");
    expect(at("note")).toBe("post-FNM");
  });

  it("a played snapshot counts against the played allowance only, and is stamped too", async () => {
    answers = [[[57]], [[9]], []];
    await insertVersion(tx(), DECK, cards, "Played Oct 10, 2026", "played");
    expect(statements[0].params).toEqual([DECK, "played"]);
    const { at } = insertParams();
    expect(at("kind")).toBe("played");
    expect(at("list_hash")).toBe(playableListHash(cards));
  });

  it("the 50 cap counts saved versions only — played snapshots never block Save version or Restore", async () => {
    // 49 saved: room, whatever the played count (never asked).
    answers = [[[49]], [[60]], []];
    await expect(insertVersion(tx(), DECK, cards, null)).resolves.toMatchObject({ version: 60 });
    statements = [];
    answers = [[[50]]];
    await expect(insertVersion(tx(), DECK, cards, null)).rejects.toBeInstanceOf(VersionCapError);
    expect(statements).toHaveLength(1);
  });

  it("at 100 played snapshots a played insert refuses (the game logs without one)", async () => {
    answers = [[[99]], [[61]], []];
    await expect(insertVersion(tx(), DECK, cards, null, "played")).resolves.toMatchObject({
      version: 61,
    });
    statements = [];
    answers = [[[100]]];
    await expect(insertVersion(tx(), DECK, cards, null, "played")).rejects.toBeInstanceOf(
      PlayedAllowanceError,
    );
    expect(statements.some((s) => s.sql.startsWith("update"))).toBe(false);
  });
});

describe("deleteVersion — never a version a logged game was played with (Y9a)", () => {
  const DECK = "33333333-3333-4333-8333-333333333333";

  it("deletes under the deck lock, guarded by a not-exists over the deck's games", async () => {
    // lock · delete (returns the row)
    answers = [[[DECK]], [[4]]];
    await expect(deleteVersion(DECK, 4)).resolves.toBe("deleted");
    expect(statements[0].sql).toMatch(/for update$/);
    const del = statements[1];
    expect(del.sql).toMatch(/^delete from "deck_versions"/);
    expect(del.sql).toMatch(
      /not exists \(select 1 from "deck_games" where "deck_games"\."deck_id" = \$\d+ and "deck_games"\."version" = \$\d+\)/,
    );
  });

  it("a version a game uses is 'in_use'; a missing one 'not_found'", async () => {
    answers = [[[DECK]], [], [[4]]];
    await expect(deleteVersion(DECK, 4)).resolves.toBe("in_use");
    statements = [];
    answers = [[[DECK]], [], []];
    await expect(deleteVersion(DECK, 4)).resolves.toBe("not_found");
  });
});

describe("frozen shape", () => {
  it("round-trips deck_cards rows into the schema's frozen shape and back to inputs", () => {
    const frozen = toFrozenCards([
      { cardIdentityId: U(1), zone: "commander", quantity: 1, tags: [], printingId: null },
      { cardIdentityId: U(2), zone: "main", quantity: 3, tags: ["Ramp"], printingId: U(9) },
    ]);
    expect(frozen).toEqual([
      { cardId: U(1), zone: "commander", qty: 1, tags: [], printingId: null },
      { cardId: U(2), zone: "main", qty: 3, tags: ["Ramp"], printingId: U(9) },
    ]);
    expect(frozenToInputs(frozen)).toEqual([
      { cardId: U(1), zone: "commander", qty: 1, tags: [] },
      { cardId: U(2), zone: "main", qty: 3, tags: ["Ramp"], printingId: U(9) },
    ]);
  });

  it("parses stored JSONB, filling optional fields, and rejects garbage", () => {
    expect(parseFrozenCards([{ cardId: U(1), zone: "main", qty: 1 }])).toEqual([
      { cardId: U(1), zone: "main", qty: 1, tags: [], printingId: null },
    ]);
    expect(() => parseFrozenCards([{ cardId: "nope", zone: "main", qty: 1 }])).toThrow();
    expect(() => parseFrozenCards({ cards: [] })).toThrow();
  });
});

describe("resolveFrozenCards (restore guard)", () => {
  const frozen: FrozenCard[] = [
    { cardId: U(1), zone: "commander", qty: 1, tags: [], printingId: U(11) },
    { cardId: U(2), zone: "main", qty: 1, tags: ["Draw"], printingId: U(12) },
    { cardId: U(3), zone: "main", qty: 2, tags: [], printingId: null },
    { cardId: U(4), zone: "main", qty: 1, tags: [], printingId: U(14) },
  ];

  it("keeps resolvable entries verbatim, printings included", () => {
    const known = new Set([U(1), U(2), U(3), U(4)]);
    const owner = new Map([
      [U(11), U(1)],
      [U(12), U(2)],
      [U(14), U(4)],
    ]);
    const out = resolveFrozenCards(frozen, known, owner);
    expect(out.printingsReset).toBe(0);
    expect(out.cardsDropped).toBe(0);
    expect(out.entries).toEqual(frozenToInputs(frozen));
  });

  it("falls back to the default printing when the chosen one is gone or belongs to another card", () => {
    const known = new Set([U(1), U(2), U(3), U(4)]);
    // U(12) vanished; U(14) now points at a different identity.
    const owner = new Map([
      [U(11), U(1)],
      [U(14), U(2)],
    ]);
    const out = resolveFrozenCards(frozen, known, owner);
    expect(out.printingsReset).toBe(2);
    expect(out.cardsDropped).toBe(0);
    expect(out.entries.find((e) => e.cardId === U(2))).toEqual({
      cardId: U(2),
      zone: "main",
      qty: 1,
      tags: ["Draw"],
    });
    expect(out.entries.find((e) => e.cardId === U(4))?.printingId).toBeUndefined();
    expect(out.entries.find((e) => e.cardId === U(1))?.printingId).toBe(U(11));
  });

  it("drops entries whose identity no longer resolves and counts them", () => {
    const known = new Set([U(1), U(3)]);
    const out = resolveFrozenCards(frozen, known, new Map([[U(11), U(1)]]));
    expect(out.cardsDropped).toBe(2);
    expect(out.entries.map((e) => e.cardId)).toEqual([U(1), U(3)]);
  });
});

describe("frozenCount (DECK-TOKENS)", () => {
  const frozen = [
    { zone: "commander", qty: 1 },
    { zone: "main", qty: 99 },
    { zone: "tokens", qty: 6 },
  ];

  it("a version's size counts the playable list's zones — never the Tokens zone", () => {
    expect(frozenCount(frozen, ["commander", "main"])).toBe(100);
  });

  it("every copy when the caller can't say which zones count", () => {
    expect(frozenCount(frozen)).toBe(106);
  });
});
