/**
 * Deck-collection reads (R5a, REDESIGN.md §2 "Deck collections"): the rows
 * behind the deck tiles on home — the recent public rail (P2.3's query,
 * grown) and Continue building for an account — plus the select the /c/
 * shelf shares. One statement per collection: the first leader's default
 * printing rides along as a LEFT JOIN on `leader_ids[1]` (cp_default_one is
 * unique per identity, so the join never multiplies rows), which is what
 * keeps the home budget at two extra statements instead of a printing
 * lookup per collection. The first leader is the art leader (R2 —
 * `leaderDenorm` writes entries order).
 *
 * Caching intent: callers decide — home and /account are force-dynamic,
 * /c/ is ISR; nothing here reads per-viewer state except the user id
 * `loadOwnerDecks` is handed.
 */
import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

const { cardPrintings, decks, users } = schema;

/** The home rail: newest activity first, 12 at most (the decks_recent_public partial index). */
export const RECENT_PUBLIC_LIMIT = 12;
/** Continue building shows the account's six most recent decks; /account lists them all. */
export const CONTINUE_BUILDING_LIMIT = 6;

/** Every column a deck tile needs, plus the byline and the joined default printing. */
export const deckCollectionSelect = {
  id: decks.id,
  publicId: decks.publicId,
  name: decks.name,
  gameId: decks.gameId,
  formatId: decks.formatId,
  visibility: decks.visibility,
  ciMask: decks.ciMask,
  leaderIds: decks.leaderIds,
  likesCount: decks.likesCount,
  updatedAt: decks.updatedAt,
  printingId: cardPrintings.id,
  imageOverride: cardPrintings.imageOverride,
  authorName: users.name,
  authorUsername: users.username,
};

/** The first leader's default printing — Postgres arrays are 1-based. */
export const defaultPrintingJoin = sql`${cardPrintings.cardIdentityId} = ${decks.leaderIds}[1] AND ${cardPrintings.isDefault}`;

function collection() {
  return getDb()
    .select(deckCollectionSelect)
    .from(decks)
    .leftJoin(users, eq(decks.userId, users.id))
    .leftJoin(cardPrintings, defaultPrintingJoin);
}

export type DeckCollectionRow = Awaited<ReturnType<typeof loadRecentPublicDecks>>[number];

/** Public decks, newest activity first (updated_at moves on real edits, never on likes). */
export async function loadRecentPublicDecks(limit = RECENT_PUBLIC_LIMIT) {
  return collection()
    .where(eq(decks.visibility, "public"))
    .orderBy(desc(decks.updatedAt))
    .limit(limit);
}

/** An account's decks, newest first, capped — the decks_owner index. Every visibility: they are the owner's. */
export async function loadOwnerDecks(userId: string, limit = CONTINUE_BUILDING_LIMIT) {
  return collection().where(eq(decks.userId, userId)).orderBy(desc(decks.updatedAt)).limit(limit);
}
