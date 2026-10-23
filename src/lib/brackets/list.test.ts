// @vitest-environment node
/**
 * The bracket list's cards (BRACKETS-PAGE), read over the REAL drizzle
 * builders and a fake postgres.js client that records every statement:
 * one statement, a containment test on the adapter's declared flag (the
 * shape ci_attrs_gin serves) with the document bound as a parameter, the
 * game's live identities only, each card's default printing joined for its
 * small image, name order; and no statement at all for a game without a
 * guide list.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getAdapter } from "@/lib/games/registry";
import type { GameAdapter } from "@/lib/games/types";

type Call = { sql: string; params: unknown[] };
let calls: Call[] = [];
/** The rows the select answers, in its column order: id, name, printing id, image override. */
let rows: unknown[][] = [];

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const { loadBracketListCards } = await import("./list");

const RHYSTIC = "11111111-1111-4111-8111-111111111111";
const RIFT = "22222222-2222-4222-8222-222222222222";
const PRINTING = "abcdef12-3456-4789-8abc-def123456789";

beforeEach(() => {
  calls = [];
  rows = [];
});

describe("loadBracketListCards", () => {
  it("one statement: containment on the adapter's flag, a bound document, live Magic identities, name order", async () => {
    await loadBracketListCards(getAdapter("mtg"));
    expect(calls).toHaveLength(1);
    const [{ sql, params }] = calls;
    expect(sql).toMatch(/"card_identities"\."attrs" @> \$\d+::jsonb/);
    expect(sql).not.toMatch(/\?\s*'game_changer'/);
    expect(params).toContain(JSON.stringify({ game_changer: true }));
    expect(sql).toMatch(/"card_identities"\."game_id" = \$\d+/);
    expect(params).toContain(1);
    expect(sql).toMatch(/"card_identities"\."is_removed" = \$\d+/);
    expect(sql).toMatch(
      /left join "card_printings" on \("card_printings"\."card_identity_id" = "card_identities"\."id" and "card_printings"\."is_default" = \$\d+\)/,
    );
    expect(sql).toMatch(/order by "card_identities"\."name" asc$/);
  });

  it("the key comes from the declaration, never from core", async () => {
    const mtg = getAdapter("mtg");
    const renamed = {
      ...mtg,
      brackets: {
        ...mtg.brackets!,
        guide: {
          ...mtg.brackets!.guide!,
          list: { ...mtg.brackets!.guide!.list, path: ["named_list"] as const },
        },
      },
    } as GameAdapter;
    await loadBracketListCards(renamed);
    expect(calls[0].params).toContain(JSON.stringify({ named_list: true }));
    const bad = {
      ...renamed,
      brackets: {
        ...renamed.brackets!,
        guide: {
          ...renamed.brackets!.guide!,
          list: { ...renamed.brackets!.guide!.list, path: ["x'; drop"] as const },
        },
      },
    } as GameAdapter;
    await expect(loadBracketListCards(bad)).rejects.toThrow("Invalid list path");
    expect(calls).toHaveLength(1);
  });

  it("returns each card's name, identity id and small image; no printing, no image", async () => {
    rows = [
      [RIFT, "Cyclonic Rift", null, null],
      [RHYSTIC, "Rhystic Study", PRINTING, null],
    ];
    expect(await loadBracketListCards(getAdapter("mtg"))).toEqual([
      { id: RIFT, name: "Cyclonic Rift", image: null },
      {
        id: RHYSTIC,
        name: "Rhystic Study",
        image: `https://cards.scryfall.io/small/front/a/b/${PRINTING}.jpg`,
      },
    ]);
  });

  it("an override off the allowed hosts renders no image", async () => {
    rows = [[RHYSTIC, "Rhystic Study", PRINTING, { front: "https://example.com/rhystic.jpg" }]];
    expect((await loadBracketListCards(getAdapter("mtg")))[0].image).toBeNull();
  });

  it("a game without a guide list asks nothing", async () => {
    expect(await loadBracketListCards(getAdapter("optcg"))).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
