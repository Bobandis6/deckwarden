// @vitest-environment node
/**
 * /api/decks/[id]/versions/[version] DELETE (Y9a, WAVE4 D10): a version a
 * logged game was played with stays while the game does — 409 with the
 * journal's sentence; a free one deletes (204); a missing one is 404. Real
 * drizzle builders over a fake postgres.js client, as in the games routes.
 */
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";
import type { DeckRow } from "@/lib/decks/serialize";

let answers: unknown[][][] = [];
const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe() {
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
const OWNER = "0b5a4f8e-1111-4222-8333-944445555666";
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => OWNER }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: async () => null,
}));

const { DELETE } = await import("./route");

const DECK = "33333333-3333-4333-8333-333333333333";
const COLUMNS = Object.keys(getTableColumns(schema.decks)) as (keyof DeckRow)[];
const deck: Record<string, unknown> = {
  id: DECK,
  publicId: "abcdefgh2345",
  gameId: GAME_ID.mtg,
  formatId: 1,
  userId: OWNER,
  claimToken: null,
  createdIp: null,
  name: "Atraxa Superfriends",
  description: null,
  notes: null,
  visibility: "public",
  kind: "user",
  leaderIds: [],
  ciMask: 0,
  folderId: null,
  forkedFromDeckId: null,
  currentVersion: 3,
  likesCount: 0,
  goals: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
};
const deckRow = COLUMNS.map((c) => deck[c]);
const del = () =>
  DELETE(
    new NextRequest(`http://localhost:3000/api/decks/${DECK}/versions/2`, { method: "DELETE" }),
    {
      params: Promise.resolve({ id: DECK, version: "2" }),
    },
  );

beforeEach(() => {
  answers = [];
});

describe("DELETE a version (Y9a)", () => {
  it("a free version deletes → 204", async () => {
    // deck · lock · delete returning it
    answers = [[deckRow], [[DECK]], [[2]]];
    expect((await del()).status).toBe(204);
  });

  it("one a logged game was played with stays → 409 with the journal's sentence", async () => {
    // deck · lock · delete (refused by not-exists) · still there
    answers = [[deckRow], [[DECK]], [], [[2]]];
    const res = await del();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "A logged game was played with this list, so it stays while the game does.",
    );
  });

  it("a missing one → 404", async () => {
    answers = [[deckRow], [[DECK]], [], []];
    expect((await del()).status).toBe(404);
  });
});
