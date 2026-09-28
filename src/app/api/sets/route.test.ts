// @vitest-environment node
/**
 * GET /api/sets (X4a): one statement — the live-card count per released
 * paper set — over the REAL drizzle builders and a fake postgres.js client;
 * the rows grouped and numbered by lines.ts (whose rules lines.test.ts
 * pins); a game that declares no set field answers an honest empty list
 * with no statement; the day-long edge cache.
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

async function get(query: string) {
  const res = await GET(new NextRequest(`http://localhost/api/sets?${query}`));
  return { res, body: await res.json() };
}

beforeEach(() => {
  statements = [];
  answers = [];
});

describe("GET /api/sets", () => {
  it("Magic: ONE statement, the rows grouped and placed, the day-long cache header", async () => {
    // [code, name, releasedAt, setType, cards] — the SQL's order.
    answers = [
      [
        ["blc", "Bloomburrow Commander", "2024-08-02", "commander", 350],
        ["blb", "Bloomburrow", "2024-08-02", "expansion", 279],
        ["pblb", "Bloomburrow Promos", "2024-08-02", "promo", 40],
        ["sld", "Secret Lair Drop", "2019-12-02", "box", 1735],
        ["emn", "Eldritch Moon", "2016-07-22", "expansion", 208],
      ],
    ];
    const { res, body } = await get("game=mtg");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=86400, stale-while-revalidate=86400",
    );
    expect(statements).toHaveLength(1);
    const [s] = statements;
    expect(s.sql).toContain(
      `inner join (select "set_id", count(DISTINCT "card_identity_id")::int as "cards" from "card_printings"`,
    );
    expect(s.sql).toContain(`group by "card_printings"."set_id"`);
    expect(s.sql).toContain(
      `exists (select 1 from "card_identities" where ("card_identities"."id" = "card_printings"."card_identity_id" and "card_identities"."is_removed" = $`,
    );
    expect(s.sql).toContain(
      `(NOT "sets"."digital" AND "sets"."released_at" <= (now() AT TIME ZONE 'UTC')::date)`,
    );
    expect(s.sql).toMatch(/order by "sets"\."released_at" desc, "cards" desc, "sets"\."name" asc$/);
    expect(s.params).toEqual([1, false, false, 1]);
    expect(body.sets).toEqual([
      {
        code: "blb",
        name: "Bloomburrow",
        releasedAt: "2024-08-02",
        setType: "expansion",
        cards: 279,
        group: "main",
        ordinal: 2,
      },
      expect.objectContaining({ code: "blc", group: "main", ordinal: 1 }),
      expect.objectContaining({ code: "pblb", group: "other", ordinal: null }),
      expect.objectContaining({ code: "sld", group: "main", ordinal: null }),
      expect.objectContaining({ code: "emn", group: "main", ordinal: 1 }),
    ]);
  });

  it("One Piece declares no set field: an honest empty list, no statement", async () => {
    const { res, body } = await get("game=optcg");
    expect(res.status).toBe(200);
    expect(body).toEqual({ sets: [] });
    expect(statements).toHaveLength(0);
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  it("an unknown game is a 400 before any statement", async () => {
    const { res } = await get("game=azuki");
    expect(res.status).toBe(400);
    expect(statements).toHaveLength(0);
  });
});
