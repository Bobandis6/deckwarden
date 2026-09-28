// @vitest-environment node
/**
 * GET /api/combos/[key] (X3, WAVE3.md D3): the statements it sends and the
 * body it answers, through the REAL drizzle builders over a fake
 * postgres.js client (X2's suggest-route pattern) — so the rendered SQL,
 * the statement count (three: the lookup, then loadCardWires' wire join
 * and legality read; none for a malformed key; one for an unknown key),
 * the piece order and the cache header on both answers are what the route
 * really does. The live answers are the smokes' (smoke:autofill).
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

const KIKI = "ba951d7e-9938-411d-8f03-8a10c59cd5cf";
const CONSCRIPTS = "3c309669-cdfe-4a9e-82b2-418bbc4754a8";
const KIKI_PRINTING = "5bef0790-aa1b-4144-8391-338e59e86115";

/** A lookup row in loadComboByKey's column order. */
function pieceRow(p: { id: string; name: string; key: string; removed?: boolean }): unknown[] {
  return [
    106877,
    "618-1537",
    ["Infinite creature tokens with haste", "Infinite death triggers"],
    [],
    28185,
    p.id,
    p.name,
    p.key,
    p.removed ?? false,
  ];
}

/** A wire row in wireSelect's column order (src/lib/cards/wire.ts). */
function wireRow(w: {
  id: string;
  name: string;
  leader?: boolean;
  printingId?: string;
}): unknown[] {
  return [
    w.id,
    w.name,
    w.name.toLowerCase(),
    `oracle-${w.id.slice(0, 4)}`,
    "Creature",
    5,
    8,
    8,
    "0.35",
    500,
    w.leader ?? false,
    false,
    { type_line: "Creature" },
    w.printingId ?? null,
    null,
  ];
}

async function get(key: string) {
  const res = await GET(new NextRequest(`http://localhost/api/combos/${key}`), {
    params: Promise.resolve({ key }),
  });
  return { res, body: await res.json() };
}

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

beforeEach(() => {
  statements = [];
  answers = [];
});

describe("GET /api/combos/[key]", () => {
  it("a known key: the lookup + the two wire statements; the combo, and one wire per piece in the pieces' name order", async () => {
    answers = [
      [
        pieceRow({ id: KIKI, name: "Kiki-Jiki, Mirror Breaker", key: "oracle-kiki" }),
        pieceRow({ id: CONSCRIPTS, name: "Zealous Conscripts", key: "oracle-conscripts" }),
      ],
      // Database order, not the pieces' order — the route re-orders.
      [
        wireRow({ id: CONSCRIPTS, name: "Zealous Conscripts" }),
        wireRow({
          id: KIKI,
          name: "Kiki-Jiki, Mirror Breaker",
          leader: true,
          printingId: KIKI_PRINTING,
        }),
      ],
      [[KIKI, "legal", null]],
    ];
    const { res, body } = await get("618-1537");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CACHE);

    expect(statements).toHaveLength(3);
    const [lookup, wires, legality] = statements;
    expect(lookup.sql).toContain('where "combos"."external_key" = $1');
    expect(lookup.sql).toContain('order by "card_identities"."name"');
    expect(lookup.params).toEqual(["618-1537"]);
    expect(wires.sql).toContain('"card_printings"."is_default" = $1');
    expect(wires.params).toEqual(expect.arrayContaining([KIKI, CONSCRIPTS]));
    // Commander legality (FORMAT_ID.commander = 1).
    expect(legality.sql).toContain('"legalities"."format_id" = $1');
    expect(legality.params[0]).toBe(1);

    expect(body.combo).toEqual({
      id: 106877,
      externalKey: "618-1537",
      results: ["Infinite creature tokens with haste", "Infinite death triggers"],
      templates: [],
      popularity: 28185,
      pieces: [
        { id: KIKI, name: "Kiki-Jiki, Mirror Breaker", externalKey: "oracle-kiki" },
        { id: CONSCRIPTS, name: "Zealous Conscripts", externalKey: "oracle-conscripts" },
      ],
    });
    expect(body.cards.map((c: { id: string }) => c.id)).toEqual([KIKI, CONSCRIPTS]);
    const [kiki, conscripts] = body.cards;
    expect(kiki.isLeaderCandidate).toBe(true);
    expect(kiki.legality).toEqual([{ status: "legal" }]);
    expect(kiki.image).toContain(KIKI_PRINTING);
    expect(kiki).not.toHaveProperty("nameNorm");
    expect(conscripts.cheapestUsd).toBe(0.35);
    expect(conscripts.image).toBeNull();
  });

  it("an unknown key: 404 with the SAME cache header (the miss cache), after one statement", async () => {
    answers = [[]];
    const { res, body } = await get("999-999");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe(CACHE);
    expect(body).toEqual({ error: "Unknown combo" });
    expect(statements).toHaveLength(1);
  });

  it("a combo holding a removed piece answers like an unknown key — no deck could be seeded with it", async () => {
    answers = [
      [
        pieceRow({ id: KIKI, name: "Kiki-Jiki, Mirror Breaker", key: "oracle-kiki" }),
        pieceRow({ id: CONSCRIPTS, name: "Zealous Conscripts", key: "oracle-c", removed: true }),
      ],
    ];
    const { res } = await get("618-1537");
    expect(res.status).toBe(404);
    expect(statements).toHaveLength(1);
  });

  it("keys off the stored shape are a 400 before any statement; multi-template keys pass", async () => {
    for (const bad of ["abc", "618--", "-618", "618-1537-", "618---1537", "1".repeat(65)]) {
      const { res } = await get(bad);
      expect(res.status, bad).toBe(400);
    }
    expect(statements).toHaveLength(0);

    answers = [[]];
    const { res } = await get("4153-4247--5--195");
    expect(res.status).toBe(404);
    expect(statements[0].params).toEqual(["4153-4247--5--195"]);
  });
});
