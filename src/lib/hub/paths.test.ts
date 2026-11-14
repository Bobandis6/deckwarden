// @vitest-environment node
/**
 * revalidateCommandZoneChange (the 2026-11 security audit's run-2 hub
 * record): a public deck whose leader set changed marks the hubs of its old
 * and new commanders and never the sitemap; an unchanged set (order aside),
 * an unlisted or private deck marks nothing and runs no statement; a failed
 * slug lookup is logged, never thrown. `next/cache` is mocked; the slug
 * lookup runs over the REAL drizzle builders and a fake postgres.js client.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const SLUGS: Record<string, string> = { [A]: "commander-a", [B]: "commander-b", [C]: "partner-c" };

let statements: string[] = [];
let failLookup = false;
const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[] = []) {
    statements.push(sql);
    if (failLookup) throw new Error("connection reset");
    const rows = sql.startsWith('select "slug" from "card_identities"')
      ? params.flatMap((id) => (SLUGS[id as string] ? [[SLUGS[id as string]]] : []))
      : [];
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));
const revalidated: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

const { revalidateCommandZoneChange } = await import("./paths");

function deck(visibility: string, leaderIds: string[], gameId: number = GAME_ID.mtg) {
  return { gameId, visibility, leaderIds };
}

beforeEach(() => {
  statements = [];
  failLookup = false;
  revalidated.length = 0;
});

describe("revalidateCommandZoneChange", () => {
  it("a public deck's commander A → B: both hubs, not the sitemap", async () => {
    const paths = await revalidateCommandZoneChange(deck("public", [A]), [B]);
    expect(revalidated.sort()).toEqual(["/c/commander-a", "/c/commander-b"]);
    expect(paths.sort()).toEqual(["/c/commander-a", "/c/commander-b"]);
    expect(revalidated).not.toContain("/sitemap.xml");
  });

  it("dropping one partner marks both the kept and the dropped commander's hub", async () => {
    await revalidateCommandZoneChange(deck("public", [A, C]), [A]);
    expect(revalidated.sort()).toEqual(["/c/commander-a", "/c/partner-c"]);
  });

  it("an unchanged leader set, in any order: nothing marked, no statement", async () => {
    await revalidateCommandZoneChange(deck("public", [A, C]), [C, A]);
    await revalidateCommandZoneChange(deck("public", [A]), [A]);
    expect(revalidated).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("an unlisted or private deck: nothing marked, no statement", async () => {
    for (const visibility of ["unlisted", "private"]) {
      await revalidateCommandZoneChange(deck(visibility, [A]), [B]);
    }
    expect(revalidated).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("a One Piece deck: its /l/ hubs carry no shelf, so nothing is marked", async () => {
    await revalidateCommandZoneChange(deck("public", [A], GAME_ID.optcg), [B]);
    expect(revalidated).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("a failed slug lookup is logged, never thrown", async () => {
    failLookup = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(revalidateCommandZoneChange(deck("public", [A]), [B])).resolves.toEqual([]);
    expect(error).toHaveBeenCalledOnce();
    expect(revalidated).toEqual([]);
    error.mockRestore();
  });
});
