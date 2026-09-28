// @vitest-environment node
/**
 * GET /api/cards/search (X4a's pins): the statements it sends and the body it
 * answers, through the REAL drizzle builders over a fake postgres.js client
 * (X2's pattern). Without `set` the SQL is pinned VERBATIM as it was before
 * X4a (captured from 69636a4's route) and the rows carry no `printingId` —
 * with the byte comparison of live responses, this is the "without a set,
 * nothing changes" contract. With a set: the in-set printing's derived
 * table, the translator's EXISTS, `sort=number`, `printingId` on the wire,
 * and the one extra statement that words an empty answer's warning.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

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

const { GET } = await import("./route");

const SELECT_CARD = `select "card_identities"."id", "card_identities"."name", "card_identities"."external_key", "card_identities"."primary_type", "card_identities"."cost_value", "card_identities"."colors_mask", "card_identities"."ci_mask", "card_identities"."cheapest_usd", "card_identities"."popularity", "card_identities"."is_leader_candidate", "card_identities"."is_preview", "card_identities"."attrs"`;

/** /cards' first request before X4a — 69636a4's statement, verbatim. */
const CARDS_FIRST_PAGE = `${SELECT_CARD}, "card_printings"."id", "card_printings"."image_override", count(*) over()::int from "card_identities" left join "card_printings" on ("card_printings"."card_identity_id" = "card_identities"."id" and "card_printings"."is_default" = $1) where ("card_identities"."game_id" = $2 and "card_identities"."is_removed" = $3) order by "card_identities"."popularity" ASC NULLS LAST, "card_identities"."name_norm" limit $4`;

/** The editor's One Piece id pass (`OP01-02`) before X4a, verbatim. */
const OP_ID_PASS = `${SELECT_CARD}, "card_printings"."id", "card_printings"."image_override", count(*) over()::int from "card_identities" left join "card_printings" on ("card_printings"."card_identity_id" = "card_identities"."id" and "card_printings"."is_default" = $1) where ("card_identities"."game_id" = $2 and "card_identities"."is_removed" = $3 and "card_identities"."external_key" LIKE $4) order by "card_identities"."external_key" ASC, "card_identities"."name_norm" limit $5`;

const PRINTING = "f791876a-f3fb-45b8-90a9-af846d8b8f74";

/** A card row in the select's column order. */
function row(r: {
  id: string;
  name: string;
  popularity?: number | null;
  printingId?: string | null;
  total?: number;
}): unknown[] {
  return [
    r.id,
    r.name,
    `key-${r.id}`,
    "Land",
    0,
    0,
    0,
    "0.25",
    r.popularity ?? null,
    false,
    false,
    { type_line: "Basic Land — Forest" },
    r.printingId ?? null,
    null,
    r.total ?? 1,
  ];
}

async function get(query: string) {
  const res = await GET(new NextRequest(`http://localhost/api/cards/search?${query}`));
  return { res, body: await res.json() };
}

beforeEach(() => {
  statements = [];
  answers = [];
});

describe("GET /api/cards/search — without a set, what it was", () => {
  it("/cards' first request: the same statement, the same params, one statement", async () => {
    await get("game=mtg&limit=60");
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toBe(CARDS_FIRST_PAGE);
    expect(statements[0].params).toEqual([true, 1, false, 60]);
  });

  it("the One Piece id pass, with or without a `set` (One Piece declares no set field)", async () => {
    await get("game=optcg&format=standard&name=OP01-02&limit=20");
    await get("game=optcg&format=standard&name=OP01-02&limit=20&set=op01");
    expect(statements.map((s) => s.sql)).toEqual([OP_ID_PASS, OP_ID_PASS]);
    expect(statements[1].params).toEqual([true, 2, false, "OP01-02%", 20]);
  });

  it("the rows carry no printingId; the image is the default printing's", async () => {
    answers = [[row({ id: "forest", name: "Forest", printingId: PRINTING })]];
    const { body, res } = await get("game=mtg&limit=60");
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600",
    );
    expect(Object.keys(body.results[0])).toEqual([
      "id",
      "name",
      "externalKey",
      "primaryType",
      "costValue",
      "colorsMask",
      "ciMask",
      "popularity",
      "isLeaderCandidate",
      "isPreview",
      "attrs",
      "cheapestUsd",
      "legality",
      "image",
    ]);
    expect(body.results[0].image).toBe(
      `https://cards.scryfall.io/normal/front/f/7/${PRINTING}.jpg`,
    );
    expect(body).not.toHaveProperty("warnings");
  });

  it("sort=number with no set is the default order (it needs a set's printing to mean anything)", async () => {
    await get("game=mtg&limit=60&sort=number");
    expect(statements[0].sql).toBe(CARDS_FIRST_PAGE);
  });
});

describe("GET /api/cards/search — a set scope", () => {
  it("one statement: the in-set printing LEFT JOINed, the translator's EXISTS, collector-number order; rows carry printingId", async () => {
    answers = [
      [
        row({ id: "banishing", name: "Banishing Light", printingId: "p-001", total: 279 }),
        row({ id: "forest", name: "Forest", printingId: PRINTING, total: 279 }),
      ],
    ];
    const { body } = await get("game=mtg&limit=60&set=BLB&sort=number");
    expect(statements).toHaveLength(1);
    const [s] = statements;
    expect(s.sql).toContain(`left join (select distinct on ("in_set_printing"."card_identity_id")`);
    expect(s.sql).toContain(`) "in_set" on "in_set"."card_identity_id" = "card_identities"."id"`);
    expect(s.sql).toContain(`"in_set"."id", "in_set"."image_override", count(*) over()::int`);
    expect(s.sql).toContain(`exists (select 1 from "card_printings" "set_printing"`);
    expect(s.sql).not.toContain(`"card_printings"."is_default"`);
    expect(s.sql).toMatch(
      /order by \(substring\("in_set"\."collector_number" from '\^\[0-9\]\+'\)\)::numeric ASC NULLS LAST, "in_set"\."collector_number" ASC, "in_set"\."id" ASC, "card_identities"\."name_norm" limit \$\d+$/,
    );
    // Every value bound; the code lowercased on both sides of the join.
    expect(s.params.filter((p) => p === "blb")).toHaveLength(2);
    expect(s.sql).not.toContain("blb");
    expect(body.total).toBe(279);
    expect(body.results.map((r: { printingId: string }) => r.printingId)).toEqual([
      "p-001",
      PRINTING,
    ]);
    expect(Object.keys(body.results[1]).at(-1)).toBe("printingId");
    expect(body.results[1].image).toBe(
      `https://cards.scryfall.io/normal/front/f/7/${PRINTING}.jpg`,
    );
    expect(body).not.toHaveProperty("warnings");
  });

  it("the strip's request: sort=pop, limit 12, still the set's printing", async () => {
    await get("game=mtg&limit=12&set=emn&sort=pop");
    expect(statements[0].sql).toContain(`"in_set"."id"`);
    expect(statements[0].sql).toMatch(
      /order by "card_identities"\."popularity" ASC NULLS LAST, "card_identities"\."name_norm" limit \$\d+$/,
    );
    expect(statements[0].params.at(-1)).toBe(12);
  });

  it("a set and a name: the name's filter and the dropdown's order (sort=best), inside the set", async () => {
    await get("game=mtg&limit=60&name=for&set=blb&sort=best");
    const [s] = statements;
    expect(s.sql).toContain(`"card_identities"."name_norm" LIKE $`);
    expect(s.sql).toContain(`exists (select 1 from "card_printings" "set_printing"`);
    expect(s.sql).toContain(`order by CASE WHEN "card_identities"."name_norm" = $`);
  });

  it("an empty answer asks the sets table why: unknown, digital-only, unreleased — or says nothing for a released set", async () => {
    const cases: [unknown[][], string[] | undefined][] = [
      [[], [`set: no set has the code "zzz"`]],
      [[[true, false]], [`set: "zzz" is a digital-only set`]],
      [[[false, false]], [`set: "zzz" is not released yet`]],
      [[[false, null]], [`set: "zzz" is not released yet`]],
      [[[false, true]], undefined],
    ];
    for (const [status, warnings] of cases) {
      statements = [];
      answers = [[], status];
      const { body } = await get("game=mtg&limit=60&set=zzz");
      expect(statements).toHaveLength(2);
      expect(statements[1].sql).toBe(
        `select "digital", (NOT "sets"."digital" AND "sets"."released_at" <= (now() AT TIME ZONE 'UTC')::date) from "sets" where ("sets"."game_id" = $1 and "sets"."code" = $2) limit $3`,
      );
      expect(statements[1].params).toEqual([1, "zzz", 1]);
      expect(body).toMatchObject({ results: [], total: 0 });
      expect(body.warnings).toEqual(warnings);
    }
  });

  it("a malformed code: one statement that matches nothing, and a warning — never every card", async () => {
    const { body } = await get("game=mtg&limit=60&set=bl%25b");
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain(`"card_identities"."is_removed" = $3 and false)`);
    expect(statements[0].sql).not.toContain("in_set");
    expect(body.warnings).toEqual([`set: "bl%b" is not a set code`]);
    expect(body.results[0] ?? null).toBeNull();
  });
});
