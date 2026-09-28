// @vitest-environment node
/**
 * GET /api/cards/suggest (X2, WAVE3.md D2): the statements it sends and the
 * rows it answers, through the REAL drizzle builders over a fake postgres.js
 * client — so the rendered SQL, the statement count (one; two only for the
 * trigram pass; none below two characters) and the row mapping are what the
 * route really does. The ranking's semantics are name-match.test.ts's; the
 * live acceptance table ran against the database (WAVE3.md X2 ship note).
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

/** A row in the select's column order (suggest.ts slimSelect). */
function row(r: {
  id: string;
  name: string;
  slug?: string | null;
  isLeader?: boolean;
  typeLine?: string | null;
  colorsMask?: number;
  ciMask?: number;
  externalKey?: string;
  printingId?: string | null;
  imageOverride?: unknown;
}): unknown[] {
  return [
    r.id,
    r.name,
    r.slug ?? null,
    r.isLeader ?? false,
    r.typeLine ?? null,
    r.colorsMask ?? 0,
    r.ciMask ?? 0,
    r.externalKey ?? "x",
    r.printingId ?? null,
    r.imageOverride ?? null,
  ];
}

const SOL_PRINTING = "5bef0790-aa1b-4144-8391-338e59e86115";

async function get(query: string) {
  const res = await GET(new NextRequest(`http://localhost/api/cards/suggest?${query}`));
  return { res, body: await res.json() };
}

beforeEach(() => {
  statements = [];
  answers = [];
});

describe("GET /api/cards/suggest", () => {
  it("one normalized character: an empty 200, the cache header, and no statement", async () => {
    const { res, body } = await get("game=mtg&scope=cards&q=A");
    expect(res.status).toBe(200);
    expect(body).toEqual({ q: "a", results: [] });
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(statements).toHaveLength(0);
  });

  it("a name: ONE statement — classes 1–3, ranked, limited to 8 in SQL — and the slim rows", async () => {
    answers = [
      [
        row({
          id: "id-sol",
          name: "Sol Ring",
          typeLine: "Artifact",
          externalKey: "6ad8011d",
          printingId: SOL_PRINTING,
        }),
        row({ id: "id-solemn", name: "Solemn Simulacrum", typeLine: "Artifact Creature — Golem" }),
      ],
    ];
    const { res, body } = await get("game=mtg&scope=cards&q=Sol");
    expect(res.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(statements).toHaveLength(1);
    const [s] = statements;
    expect(s.sql).toContain('"card_identities"."name_norm" LIKE');
    expect(s.sql).toMatch(/order by CASE WHEN "card_identities"\."name_norm" = \$\d+ THEN 1/);
    expect(s.sql).toContain('"card_identities"."popularity" ASC NULLS LAST');
    expect(s.sql).toMatch(/limit \$\d+$/);
    expect(s.params.at(-1)).toBe(8);
    expect(s.params).toContain("sol%");
    expect(s.params).toContain("%-sol%");
    expect(s.sql).not.toContain('is_leader_candidate" = ');
    expect(body.q).toBe("sol");
    expect(body.results).toEqual([
      {
        id: "id-sol",
        name: "Sol Ring",
        slug: null,
        isLeader: false,
        typeLine: "Artifact",
        colorsMask: 0,
        ciMask: 0,
        externalKey: "6ad8011d",
        image: `https://cards.scryfall.io/small/front/5/b/${SOL_PRINTING}.jpg`,
      },
      expect.objectContaining({ name: "Solemn Simulacrum", image: null }),
    ]);
  });

  it("scope=leaders is the hub scope: leader candidates with a slug", async () => {
    answers = [
      [row({ id: "k", name: "Krenko, Mob Boss", slug: "krenko-mob-boss", isLeader: true })],
    ];
    const { body } = await get("game=mtg&scope=leaders&q=kr");
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('"card_identities"."is_leader_candidate" = $');
    expect(statements[0].sql).toContain('"card_identities"."slug" IS NOT NULL');
    expect(body.results[0]).toMatchObject({ slug: "krenko-mob-boss", isLeader: true });
  });

  it("the trigram pass is a SECOND statement, only under 8 rows and from four characters", async () => {
    answers = [[], [row({ id: "saga", name: "Urza's Saga" }), row({ id: "urza", name: "Urza's" })]];
    const { body } = await get("game=mtg&scope=cards&q=urzas+saga");
    expect(statements).toHaveLength(2);
    expect(statements[1].sql).toContain('"card_identities"."name_norm" % $');
    expect(statements[1].params).toContain("urzas saga");
    expect(statements[1].params.at(-1)).toBe(8);
    expect(body.results.map((r: { name: string }) => r.name)).toEqual(["Urza's Saga", "Urza's"]);
  });

  it("the trigram pass skips the rows already found and fills only the remaining places", async () => {
    answers = [[row({ id: "a1", name: "Atog" })], []];
    await get("game=mtg&scope=cards&q=atogs");
    expect(statements).toHaveLength(2);
    expect(statements[1].sql).toContain('"card_identities"."id" not in ($');
    expect(statements[1].params).toContain("a1");
    expect(statements[1].params.at(-1)).toBe(7);
  });

  it("no trigram pass below four characters, nor when the first statement filled the list", async () => {
    answers = [[row({ id: "a", name: "Atarka, World Render" })]];
    await get("game=mtg&scope=cards&q=at");
    expect(statements).toHaveLength(1);

    statements = [];
    answers = [Array.from({ length: 8 }, (_, i) => row({ id: `r${i}`, name: `Ring ${i}` }))];
    await get("game=mtg&scope=cards&q=ring");
    expect(statements).toHaveLength(1);
  });

  it("a One Piece card number takes the id pass: one statement in card-number order, no name ranking", async () => {
    answers = [
      [
        row({
          id: "h",
          name: "Hyogoro",
          externalKey: "OP01-020",
          typeLine: "Character — Land of Wano",
          printingId: "00000000-0000-4000-8000-000000000001",
          imageOverride: { front: "https://pub-example.r2.dev/OP01-020.png" },
        }),
      ],
    ];
    const { body } = await get("game=optcg&scope=cards&q=op01-02");
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('"card_identities"."external_key" LIKE $');
    expect(statements[0].params).toContain("OP01-02%");
    expect(statements[0].sql).toContain('order by "card_identities"."external_key" ASC');
    expect(statements[0].sql).not.toContain("CASE");
    // One Piece thumbnails follow thumbnailUrl(): a spacer until LATER row 51.
    expect(body.results[0]).toMatchObject({ externalKey: "OP01-020", image: null });
  });

  it("Magic never takes the id pass", async () => {
    answers = [[]];
    await get("game=mtg&scope=cards&q=op01-02");
    expect(statements[0].sql).not.toContain('external_key" LIKE');
    expect(statements[0].sql).toContain("CASE");
  });

  it("a bad game or scope is a 400 and sends nothing", async () => {
    for (const query of ["game=azuki&q=sol", "scope=all&q=sol", `q=${"a".repeat(201)}`]) {
      const { res } = await get(query);
      expect(res.status).toBe(400);
    }
    expect(statements).toHaveLength(0);
  });
});
