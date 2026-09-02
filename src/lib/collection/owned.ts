/**
 * Collection reads (P3.7). The owned set is per IDENTITY — the user owns
 * any printing of the card — derived by joining collections → card_printings
 * in one query. Consumers: GET /api/decks/[id] (the editor's badges and
 * "you own N/100" line, restricted to the deck's own cards so the payload
 * stays ~100 ids, not the whole collection), POST /api/collection/owned
 * (the editor asking about cards added mid-session), the share page (the
 * signed-in viewer's line), and the recommendations route's opt-in filter
 * (the full set, once per request).
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema, type DbExecutor } from "@/db";
import type { CollectionSummary } from "./types";

const { collections, cardPrintings: cp } = schema;

const CHUNK = 2000;

/**
 * Identity ids the user owns at least one printing of. With `among`, only
 * those identities are checked (deck-sized lists); without it, the whole
 * collection's identities.
 */
export async function ownedIdentityIds(
  userId: string,
  among?: readonly string[],
  db: DbExecutor = getDb(),
): Promise<Set<string>> {
  const owned = new Set<string>();
  if (among === undefined) {
    const rows = await db
      .selectDistinct({ identityId: cp.cardIdentityId })
      .from(collections)
      .innerJoin(cp, eq(cp.id, collections.printingId))
      .where(eq(collections.userId, userId));
    for (const r of rows) owned.add(r.identityId);
    return owned;
  }
  const ids = [...new Set(among)];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await db
      .selectDistinct({ identityId: cp.cardIdentityId })
      .from(collections)
      .innerJoin(cp, eq(cp.id, collections.printingId))
      .where(
        and(eq(collections.userId, userId), inArray(cp.cardIdentityId, ids.slice(i, i + CHUNK))),
      );
    for (const r of rows) owned.add(r.identityId);
  }
  return owned;
}

/** Row / printing / identity counts + last write — GET /api/collection and every import report. */
export async function collectionSummary(
  userId: string,
  db: DbExecutor = getDb(),
): Promise<CollectionSummary> {
  const [row] = await db
    .select({
      rows: sql<number>`count(*)::int`,
      printings: sql<number>`count(distinct ${collections.printingId})::int`,
      identities: sql<number>`count(distinct ${cp.cardIdentityId})::int`,
      updatedAt: sql<string | null>`max(${collections.updatedAt})`,
    })
    .from(collections)
    .innerJoin(cp, eq(cp.id, collections.printingId))
    .where(eq(collections.userId, userId));
  return {
    rows: row?.rows ?? 0,
    printings: row?.printings ?? 0,
    identities: row?.identities ?? 0,
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/** Whether the user holds any collection row — the gate for every "owned" surface. */
export async function hasCollection(userId: string, db: DbExecutor = getDb()): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(collections)
    .where(eq(collections.userId, userId))
    .limit(1);
  return row !== undefined;
}

/**
 * What GET /api/decks/[id] tells the signed-in requester about THIS deck:
 * the deck's identities they own (≤ deck size, never the whole collection)
 * and whether a collection exists at all — the UI shows "0/100 owned" to a
 * user who imported a collection none of these cards are in, and nothing
 * to a user who never imported one. Guests (no session) get the empty
 * answer: collections are account-only.
 */
export async function deckOwnedForViewer(
  userId: string | null,
  cardIds: readonly string[],
): Promise<{ owned: string[]; hasCollection: boolean }> {
  if (!userId || !(await hasCollection(userId))) return { owned: [], hasCollection: false };
  const owned = await ownedIdentityIds(userId, cardIds);
  return { owned: [...owned], hasCollection: true };
}
