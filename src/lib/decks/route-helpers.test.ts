// @vitest-environment node
/**
 * The gated write helpers (S4, SECURITY-AUDIT-report.md M1):
 * requireOwnedDeckWrite and its folder twin consume the caller's IP bucket
 * before the ownership proof and the per-resource bucket only after it —
 * through the REAL limiter over the in-memory counters table
 * (src/test/rate-limit-table.ts) and the real drizzle builders over a fake
 * postgres.js client. A non-uuid id is a 404 before any counter; a
 * stranger's refusal leaves no per-resource row; the owner's call counts
 * both; the resource bucket is keyed by the ROW's id.
 *
 * And the read contract since the 2026-10-30 security audit (its deck-oracle
 * record): on every gate in the file a PRIVATE deck a caller cannot read or
 * edit answers exactly what an unknown id answers — the same no-store 404 —
 * while a public or unlisted deck keeps its 403, and the owner's proof still
 * passes. The folder gate does the same for a private folder.
 */
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";
import type { FolderRow } from "@/lib/decks/folders";
import type { DeckRow } from "@/lib/decks/serialize";
import { createRateLimitTable } from "@/test/rate-limit-table";

const counters = createRateLimitTable();
let statements: string[] = [];
let rowAnswer: unknown[][] = [];
const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[]) {
    statements.push(sql);
    const rows = counters.handles(sql) ? counters.answer(params) : rowAnswer;
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));
const session = { userId: null as string | null, authoritative: [] as boolean[] };
vi.mock("@/lib/auth", () => ({
  getSessionUserId: async (_h: Headers, opts?: { authoritative?: boolean }) => {
    session.authoritative.push(opts?.authoritative === true);
    return session.userId;
  },
}));

const {
  requireEngageableDeck,
  requireJournalDeck,
  requireOwnedDeckWrite,
  requireOwnedFolderWrite,
  requireReadableDeck,
} = await import("./route-helpers");
const { RATE_LIMITS } = await import("@/lib/rate-limit");

const OWNER = "0b5a4f8e-1111-4222-8333-944445555666";
const DECK = "33333333-3333-4333-8333-333333333333";
const FOLDER = "44444444-4444-4444-8444-444444444444";
const TOKEN = "7a9b2c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d";

const DECK_COLUMNS = Object.keys(getTableColumns(schema.decks)) as (keyof DeckRow)[];
function deckRow(over: Partial<Record<keyof DeckRow, unknown>> = {}): unknown[] {
  const deck: Record<string, unknown> = {
    id: DECK,
    publicId: "abcdefgh2345",
    gameId: GAME_ID.mtg,
    formatId: 1,
    userId: null,
    claimToken: TOKEN,
    createdIp: null,
    name: "Guest deck",
    description: null,
    notes: null,
    visibility: "public",
    kind: "user",
    leaderIds: [],
    ciMask: 0,
    folderId: null,
    forkedFromDeckId: null,
    currentVersion: 1,
    likesCount: 0,
    goals: null,
    hiddenTokens: null,
    preconDeckId: null,
    ownsPrecon: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...over,
  };
  return DECK_COLUMNS.map((c) => deck[c]);
}
const FOLDER_COLUMNS = Object.keys(getTableColumns(schema.deckFolders)) as (keyof FolderRow)[];
function folderRow(over: Partial<Record<keyof FolderRow, unknown>> = {}): unknown[] {
  const folder: Record<string, unknown> = {
    id: FOLDER,
    publicId: "fldr12345678",
    userId: OWNER,
    name: "Brews",
    description: null,
    visibility: "unlisted",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...over,
  };
  return FOLDER_COLUMNS.map((c) => folder[c]);
}
const headers = (over: Record<string, string> = {}) =>
  new Headers({ "x-forwarded-for": "203.0.113.9", ...over });
const selects = () => statements.filter((s) => s.startsWith("select"));

beforeEach(() => {
  counters.reset();
  statements = [];
  rowAnswer = [];
  session.userId = null;
  session.authoritative = [];
});

describe("requireOwnedDeckWrite", () => {
  it("a non-uuid id: 404, no counter, no query", async () => {
    const res = await requireOwnedDeckWrite(headers(), "not-a-uuid", RATE_LIMITS.deckMetaWrite);
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(404);
    expect(counters.keys()).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("a stranger: the IP bucket, the row, a 403 — and no per-deck row", async () => {
    rowAnswer = [deckRow()];
    const res = await requireOwnedDeckWrite(headers(), DECK, RATE_LIMITS.deckMetaWrite);
    expect((res as NextResponse).status).toBe(403);
    expect(counters.keys()).toEqual(["deck-meta:ip:203.0.113.9"]);
    expect(selects()).toHaveLength(1);
  });

  it("an unknown deck: the IP bucket, the row, a 404 — still no per-deck row", async () => {
    const res = await requireOwnedDeckWrite(headers(), DECK, RATE_LIMITS.deckMetaWrite);
    expect((res as NextResponse).status).toBe(404);
    expect(counters.keys()).toEqual(["deck-meta:ip:203.0.113.9"]);
  });

  it("the owner (a guest token): IP bucket, proof, then the per-deck bucket keyed by the row's id", async () => {
    rowAnswer = [deckRow()];
    const res = await requireOwnedDeckWrite(
      headers({ "x-deck-token": TOKEN }),
      DECK.toUpperCase(),
      RATE_LIMITS.deckMetaWrite,
    );
    expect(res).toMatchObject({ isOwner: true, deck: { id: DECK } });
    expect(counters.keys()).toEqual([`deck-meta:deck:${DECK}`, "deck-meta:ip:203.0.113.9"]);
    // The IP counter precedes the row read; the deck counter follows it.
    expect(statements.map((s) => s.split(" ")[0])).toEqual(["insert", "select", "insert"]);
  });

  it("the owner at the per-deck cap is 429'd after the proof, and the IP bucket still counted", async () => {
    rowAnswer = [deckRow({ userId: OWNER, claimToken: null })];
    session.userId = OWNER;
    counters.seed(`deck-meta:deck:${DECK}`, 60, 60);
    const res = await requireOwnedDeckWrite(headers(), DECK, RATE_LIMITS.deckMetaWrite);
    expect((res as NextResponse).status).toBe(429);
    expect(counters.count("deck-meta:ip:203.0.113.9")).toBe(1);
  });

  it("at the IP cap nothing else runs — the row is never read", async () => {
    counters.seed("deck-meta:ip:203.0.113.9", 180, 60);
    const res = await requireOwnedDeckWrite(headers(), DECK, RATE_LIMITS.deckMetaWrite);
    expect((res as NextResponse).status).toBe(429);
    expect(selects()).toEqual([]);
  });

  it("passes `authoritative` through to the session read (the deck DELETE's S3 contract)", async () => {
    rowAnswer = [deckRow({ userId: OWNER, claimToken: null })];
    session.userId = OWNER;
    await requireOwnedDeckWrite(headers(), DECK, RATE_LIMITS.deckMetaWrite, {
      authoritative: true,
    });
    await requireOwnedDeckWrite(headers(), DECK, RATE_LIMITS.deckMetaWrite);
    expect(session.authoritative).toEqual([true, false]);
  });

  it("the three gated policies each split into an IP half and a deck half with the P1.8 numbers", () => {
    const pick = (p: {
      ip: (ip: string) => { key: string; max: number }[];
      resource: (id: string) => { key: string; max: number }[];
    }) => [...p.ip("1.2.3.4"), ...p.resource("d")].map((l) => [l.key, l.max]);
    expect(pick(RATE_LIMITS.deckCardsPut)).toEqual([
      ["deck-cards:ip:1.2.3.4", 360],
      ["deck-cards:deck:d", 120],
    ]);
    expect(pick(RATE_LIMITS.deckMetaWrite)).toEqual([
      ["deck-meta:ip:1.2.3.4", 180],
      ["deck-meta:deck:d", 60],
    ]);
    expect(pick(RATE_LIMITS.deckVersionWrite)).toEqual([
      ["deck-version:ip:1.2.3.4", 90],
      ["deck-version:deck:d", 30],
    ]);
    expect(pick(RATE_LIMITS.folderMetaWrite)).toEqual([
      ["folder-meta:ip:1.2.3.4", 180],
      ["folder-meta:folder:d", 60],
    ]);
  });
});

describe("requireOwnedFolderWrite", () => {
  it("a non-uuid id: 404 before any counter", async () => {
    const res = await requireOwnedFolderWrite(headers(), "nope", RATE_LIMITS.folderMetaWrite);
    expect((res as NextResponse).status).toBe(404);
    expect(counters.keys()).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("not the owner: IP bucket, the row, 403, no per-folder row", async () => {
    rowAnswer = [folderRow()];
    session.userId = "99999999-9999-4999-8999-999999999999";
    const res = await requireOwnedFolderWrite(headers(), FOLDER, RATE_LIMITS.folderMetaWrite);
    expect((res as NextResponse).status).toBe(403);
    expect(counters.keys()).toEqual(["folder-meta:ip:203.0.113.9"]);
  });

  it("the owner: both buckets, the folder returned", async () => {
    rowAnswer = [folderRow()];
    session.userId = OWNER;
    const res = await requireOwnedFolderWrite(headers(), FOLDER, RATE_LIMITS.folderMetaWrite);
    expect(res).toMatchObject({ folder: { id: FOLDER, name: "Brews" } });
    expect(counters.keys()).toEqual([`folder-meta:folder:${FOLDER}`, "folder-meta:ip:203.0.113.9"]);
  });
});

describe("a private deck is the unknown id's 404 on every gate (the audit's deck-oracle record)", () => {
  const STRANGER = "99999999-9999-4999-8999-999999999999";
  const UNKNOWN = "33333333-3333-4333-8333-000000000000";
  /** What a caller can compare across two answers. */
  async function shape(res: unknown) {
    const r = res as NextResponse;
    return { status: r.status, body: await r.json(), cache: r.headers.get("cache-control") };
  }
  const NOT_FOUND = { status: 404, body: { error: "Deck not found" }, cache: "no-store" };

  it("requireReadableDeck: signed out, a stranger's session and a wrong token read the unknown id's answer", async () => {
    expect(await shape(await requireReadableDeck(headers(), UNKNOWN))).toEqual(NOT_FOUND);
    rowAnswer = [deckRow({ visibility: "private" })];
    expect(await shape(await requireReadableDeck(headers(), DECK))).toEqual(NOT_FOUND);
    expect(
      await shape(await requireReadableDeck(headers({ "x-deck-token": "wrong" }), DECK)),
    ).toEqual(NOT_FOUND);
    rowAnswer = [deckRow({ visibility: "private", userId: OWNER, claimToken: null })];
    session.userId = STRANGER;
    expect(await shape(await requireReadableDeck(headers(), DECK))).toEqual(NOT_FOUND);
    // The session resolves on the unknown-id path too, so both answers do the same work.
    expect(session.authoritative).toHaveLength(4);
  });

  it("requireReadableDeck: the owner's token or session still reads a private deck; a visitor reads a public one", async () => {
    rowAnswer = [deckRow({ visibility: "private" })];
    expect(await requireReadableDeck(headers({ "x-deck-token": TOKEN }), DECK)).toMatchObject({
      isOwner: true,
    });
    rowAnswer = [deckRow({ visibility: "private", userId: OWNER, claimToken: null })];
    session.userId = OWNER;
    expect(await requireReadableDeck(headers(), DECK)).toMatchObject({ isOwner: true });
    session.userId = null;
    rowAnswer = [deckRow()];
    expect(await requireReadableDeck(headers(), DECK)).toMatchObject({ isOwner: false });
  });

  it("requireEngageableDeck: 401 signed out as before; a stranger's like on a private deck is the 404", async () => {
    rowAnswer = [deckRow({ visibility: "private", userId: OWNER, claimToken: null })];
    expect((await requireEngageableDeck(headers(), DECK)) as NextResponse).toHaveProperty(
      "status",
      401,
    );
    session.userId = STRANGER;
    expect(await shape(await requireEngageableDeck(headers(), DECK))).toEqual(NOT_FOUND);
    expect(await shape(await requireEngageableDeck(headers(), UNKNOWN))).toEqual(NOT_FOUND);
    rowAnswer = [deckRow()];
    expect(await requireEngageableDeck(headers(), DECK)).toMatchObject({ userId: STRANGER });
  });

  it("requireJournalDeck: a stranger gets the 404 on a private deck and the 403 on a public one", async () => {
    session.userId = STRANGER;
    rowAnswer = [deckRow({ visibility: "private", userId: OWNER, claimToken: null })];
    expect(await shape(await requireJournalDeck(headers(), DECK, RATE_LIMITS.gamesRead))).toEqual(
      NOT_FOUND,
    );
    rowAnswer = [deckRow({ userId: OWNER, claimToken: null })];
    const open = (await requireJournalDeck(headers(), DECK, RATE_LIMITS.gamesRead)) as NextResponse;
    expect(open.status).toBe(403);
    expect(await open.json()).toEqual({ error: "You don't have edit access to this deck" });
  });

  it("requireOwnedDeckWrite: a stranger's write to a private deck is the 404 — the IP bucket counted, no per-deck row", async () => {
    rowAnswer = [deckRow({ visibility: "private", userId: OWNER, claimToken: null })];
    session.userId = STRANGER;
    expect(
      await shape(await requireOwnedDeckWrite(headers(), DECK, RATE_LIMITS.deckMetaWrite)),
    ).toEqual(NOT_FOUND);
    expect(counters.keys()).toEqual(["deck-meta:ip:203.0.113.9"]);
    rowAnswer = [deckRow({ visibility: "unlisted", userId: OWNER, claimToken: null })];
    const open = (await requireOwnedDeckWrite(
      headers(),
      DECK,
      RATE_LIMITS.deckMetaWrite,
    )) as NextResponse;
    expect(open.status).toBe(403);
  });

  it("requireOwnedFolderWrite: a stranger on a private folder gets the unknown folder's 404", async () => {
    session.userId = STRANGER;
    const unknown = await shape(
      await requireOwnedFolderWrite(headers(), FOLDER, RATE_LIMITS.folderMetaWrite),
    );
    expect(unknown).toEqual({
      status: 404,
      body: { error: "Folder not found" },
      cache: "no-store",
    });
    rowAnswer = [folderRow({ visibility: "private" })];
    expect(
      await shape(await requireOwnedFolderWrite(headers(), FOLDER, RATE_LIMITS.folderMetaWrite)),
    ).toEqual(unknown);
    rowAnswer = [folderRow({ visibility: "public" })];
    const open = (await requireOwnedFolderWrite(
      headers(),
      FOLDER,
      RATE_LIMITS.folderMetaWrite,
    )) as NextResponse;
    expect(open.status).toBe(403);
    session.userId = OWNER;
    rowAnswer = [folderRow({ visibility: "private" })];
    expect(
      await requireOwnedFolderWrite(headers(), FOLDER, RATE_LIMITS.folderMetaWrite),
    ).toMatchObject({
      folder: { id: FOLDER },
    });
  });
});
