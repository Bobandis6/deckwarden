// @vitest-environment node
/**
 * POST /api/cards/resolve (S4, the audit's resolver note): the second
 * pass — double-faced front faces — binds each pasted name as a LIKE
 * prefix, and since S4 the name is ESCAPED first, so "%" and "_" in a paste
 * are literal characters, not wildcards. Through the REAL drizzle builders
 * over a fake postgres.js client; the limiter is mocked at its seam and
 * its order (before the body) pinned.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { TOKEN_DOC } from "@/lib/cards/tokens";

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
const limiter = { calls: [] as string[][], answer: null as NextResponse | null };
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: async (limits: { key: string }[]) => {
    limiter.calls.push(limits.map((l) => l.key));
    return limiter.answer;
  },
}));

const { POST } = await import("./route");

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("http://localhost:3000/api/cards/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify(body),
    }),
  );
}
const pass2 = () => statements.find((s) => s.sql.includes("LIKE ANY(ARRAY["))!;
/** The ARRAY[]'s bound patterns (the join's and the game's params come first). */
function patterns(stmt: Statement): unknown[] {
  const first = Number(/ARRAY\[\$(\d+)/.exec(stmt.sql)![1]) - 1;
  return stmt.params.slice(first);
}

beforeEach(() => {
  statements = [];
  answers = [];
  limiter.calls = [];
  limiter.answer = null;
});

describe("pass 2's LIKE patterns", () => {
  it("escapes % and _ in a pasted name — literal characters, never wildcards", async () => {
    const res = await post({ names: ["100%", "a_b", "Fable of the Mirror-Breaker", "50\\50"] });
    expect(res.status).toBe(200);
    const stmt = pass2();
    expect(stmt.sql).toContain(
      '"card_identities"."name_norm" LIKE ANY(ARRAY[$5, $6, $7, $8]::text[])',
    );
    expect(patterns(stmt)).toEqual([
      "100\\% %",
      "a\\_b %",
      "fable of the mirror-breaker %",
      "50\\\\50 %",
    ]);
    // Every pattern still ends in the literal " %" the front-face match needs.
    for (const p of patterns(stmt)) expect(String(p).endsWith(" %")).toBe(true);
  });

  it("the name passes never return a token; pass 0 may (DECK-TOKENS)", async () => {
    await post({ names: ["Mutavault", "Fable of the Mirror-Breaker"] });
    const guard = 'NOT ("card_identities"."attrs" @> $';
    const byName = statements.filter((s) => s.sql.includes("name_norm"));
    expect(byName.length).toBeGreaterThan(0);
    for (const s of byName) {
      expect(s.sql).toContain(guard);
      expect(s.params).toContain(TOKEN_DOC);
    }
    statements = [];
    await post({ names: ["c983338d-ae6b-4c42-b1df-1fd1ed1ee7a4"] });
    const byKey = statements.find((s) => s.sql.includes('"external_key" in'));
    expect(byKey).toBeDefined();
    expect(byKey!.sql).not.toContain(guard);
  });

  it("a name with none of the three binds exactly as before", async () => {
    await post({ names: ["Sol Ring"] });
    expect(patterns(pass2())).toEqual(["sol ring %"]);
  });

  it("the front-face split check still confirms a match from the escaped pattern", async () => {
    const ID = "11111111-1111-4111-8111-111111111111";
    // pass 1 finds nothing; pass 2 answers the DFC row whose front face is the paste.
    answers = [
      [],
      [
        [
          ID,
          "100% // Full Measure",
          "100% full measure",
          "key",
          "Instant",
          1,
          0,
          0,
          "0.10",
          null,
          false,
          false,
          { type_line: "Instant // Instant" },
          null,
          null,
        ],
      ],
    ];
    const res = await post({ names: ["100%"] });
    const body = await res.json();
    expect(body.results[0].match?.id).toBe(ID);
    expect(body.results[0].suggestions).toEqual([]);
  });
});

describe("the limiter", () => {
  it("is consumed before the body — a 429 reads nothing", async () => {
    limiter.answer = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const res = await post({ names: ["Sol Ring"] });
    expect(res.status).toBe(429);
    expect(limiter.calls).toEqual([
      ["card-resolve:ip:203.0.113.9", "card-resolve:ip-hour:203.0.113.9"],
    ]);
    expect(statements).toEqual([]);
  });
});
