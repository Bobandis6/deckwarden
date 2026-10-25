// @vitest-environment node
/**
 * The share page's token fill loader (TOKEN-FILL): the derivation over the
 * loaded cards, then ONE statement for the token cards — by external key,
 * scoped to the game, guarded by the token predicate, no legality query —
 * and no statement at all when the list links nothing or everything linked
 * is held or hidden. Through the real drizzle builders over a fake
 * postgres.js client (the route-test pattern).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";
import { TOKEN_DOC } from "@/lib/cards/tokens";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";

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

const { loadTokenFill } = await import("./token-fill-load");

const mtg = getAdapter("mtg");
const fmt = { adapter: mtg, format: COMMANDER };
const KEY = {
  treasure: "aaaaaaaa-0000-4000-8000-000000000001",
  soldier: "aaaaaaaa-0000-4000-8000-000000000002",
};
const tithe = card({
  name: "Smothering Tithe",
  attrs: { type_line: "Enchantment", oracle_text: "", tokens: [KEY.treasure] },
});
const elspeth = card({
  name: "Elspeth, Sun's Champion",
  attrs: { type_line: "Legendary Planeswalker", oracle_text: "", tokens: [KEY.soldier] },
});
const solRing = card({ name: "Sol Ring", attrs: { type_line: "Artifact", oracle_text: "" } });
const wire = (c: ReturnType<typeof card>, zone = "main") => ({
  cardId: c.id,
  zone,
  qty: 1,
  tags: [],
  printingId: null,
  card: { ...c, image: null },
});

/** A wireSelect row in its select order (id, name, name_norm, external_key, …). */
function tokenRow(id: string, name: string, key: string, attrs: Record<string, unknown>) {
  return [
    id,
    name,
    name.toLowerCase(),
    key,
    "Creature",
    0,
    1,
    0,
    null,
    null,
    false,
    false,
    attrs,
    null,
    null,
  ];
}
const SOLDIER_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const TREASURE_ID = "bbbbbbbb-0000-4000-8000-000000000001";

beforeEach(() => {
  statements = [];
  answers = [];
});

describe("loadTokenFill", () => {
  it("ONE statement by external key, game-scoped and token-guarded, no legality query; the rows carry their makers", async () => {
    answers = [
      [
        tokenRow(SOLDIER_ID, "Soldier", KEY.soldier, {
          type_line: "Token Creature — Soldier",
          oracle_text: "",
          is_token: true,
          power: "1",
          toughness: "1",
        }),
        tokenRow(TREASURE_ID, "Treasure", KEY.treasure, {
          type_line: "Token Artifact — Treasure",
          oracle_text: "",
          is_token: true,
        }),
      ],
    ];
    const out = await loadTokenFill(
      { gameId: GAME_ID.mtg, hiddenTokens: null },
      [wire(tithe), wire(elspeth), wire(solRing)],
      fmt,
    );
    expect(statements).toHaveLength(1);
    const [q] = statements;
    // $1 is the default-printing join's `is_default = true`.
    expect(q.sql).toContain('"card_identities"."game_id" = $2');
    expect(q.sql).toContain('"card_identities"."is_removed" = $3');
    expect(q.sql).toContain('"card_identities"."attrs" @> $4::jsonb');
    expect(q.sql).toContain('"card_identities"."external_key" in ($5, $6)');
    expect(q.sql).not.toContain("legalities");
    expect(q.params).toEqual([true, GAME_ID.mtg, false, TOKEN_DOC, KEY.treasure, KEY.soldier]);
    expect(out.map((i) => [i.card.name, i.from])).toEqual([
      ["Soldier", ["Elspeth, Sun's Champion"]],
      ["Treasure", ["Smothering Tithe"]],
    ]);
    expect(out[0].card.legality).toEqual([]);
    expect(out[0].card.externalKey).toBe(KEY.soldier);
  });

  it("hidden keys are never asked for", async () => {
    answers = [[tokenRow(SOLDIER_ID, "Soldier", KEY.soldier, { is_token: true })]];
    const out = await loadTokenFill(
      { gameId: GAME_ID.mtg, hiddenTokens: [KEY.treasure] },
      [wire(tithe), wire(elspeth)],
      fmt,
    );
    expect(statements[0].sql).toContain('"external_key" in ($5)');
    expect(statements[0].params.slice(4)).toEqual([KEY.soldier]);
    expect(out.map((i) => i.card.name)).toEqual(["Soldier"]);
  });

  it("a key the deck holds as a token row is the player's, not derived", async () => {
    const soldierCard = card({
      name: "Soldier",
      externalKey: KEY.soldier,
      attrs: { type_line: "Token Creature — Soldier", oracle_text: "", is_token: true },
    });
    answers = [[tokenRow(TREASURE_ID, "Treasure", KEY.treasure, { is_token: true })]];
    await loadTokenFill(
      { gameId: GAME_ID.mtg, hiddenTokens: null },
      [wire(tithe), wire(elspeth), wire(soldierCard, "tokens")],
      fmt,
    );
    expect(statements[0].params.slice(4)).toEqual([KEY.treasure]);
  });

  it("nothing linked, or everything held or hidden: no statement", async () => {
    expect(
      await loadTokenFill({ gameId: GAME_ID.mtg, hiddenTokens: null }, [wire(solRing)], fmt),
    ).toEqual([]);
    expect(
      await loadTokenFill(
        { gameId: GAME_ID.mtg, hiddenTokens: [KEY.treasure] },
        [wire(tithe)],
        fmt,
      ),
    ).toEqual([]);
    expect(statements).toHaveLength(0);
  });
});
