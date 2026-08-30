/**
 * Like/bookmark persistence (P2.3). Both toggles are idempotent by the
 * (deck_id, user_id) primary key — a double-click or replayed request changes
 * nothing — and both set desired state rather than flipping, so PUT/DELETE
 * retries are safe.
 *
 * Likes maintain the decks.likes_count denorm (provisioned P1.1) in the same
 * transaction, adjusting only when a row was actually inserted/deleted, so
 * the count can't drift from the rows under concurrent toggles. Neither
 * toggle touches decks.updated_at: engagement by others must never bump a
 * deck up "recently updated" rails.
 */
import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

const { deckLikes, deckBookmarks, decks } = schema;

export interface LikeState {
  liked: boolean;
  likesCount: number;
}

export async function setDeckLike(
  deckId: string,
  userId: string,
  liked: boolean,
): Promise<LikeState> {
  const db = getDb();
  return db.transaction(async (tx) => {
    let changed: unknown[];
    if (liked) {
      changed = await tx
        .insert(deckLikes)
        .values({ deckId, userId })
        .onConflictDoNothing()
        .returning({ deckId: deckLikes.deckId });
    } else {
      changed = await tx
        .delete(deckLikes)
        .where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, userId)))
        .returning({ deckId: deckLikes.deckId });
    }

    if (changed.length > 0) {
      // greatest() guards decrement-below-zero if the denorm ever drifts
      // (e.g. user-delete cascades remove like rows without a recount).
      const [row] = await tx
        .update(decks)
        .set({
          likesCount: liked
            ? sql`${decks.likesCount} + 1`
            : sql`greatest(${decks.likesCount} - 1, 0)`,
        })
        .where(eq(decks.id, deckId))
        .returning({ likesCount: decks.likesCount });
      return { liked, likesCount: row.likesCount };
    }

    const [row] = await tx
      .select({ likesCount: decks.likesCount })
      .from(decks)
      .where(eq(decks.id, deckId));
    return { liked, likesCount: row.likesCount };
  });
}

export async function setDeckBookmark(
  deckId: string,
  userId: string,
  bookmarked: boolean,
): Promise<{ bookmarked: boolean }> {
  const db = getDb();
  if (bookmarked) {
    await db.insert(deckBookmarks).values({ deckId, userId }).onConflictDoNothing();
  } else {
    await db
      .delete(deckBookmarks)
      .where(and(eq(deckBookmarks.deckId, deckId), eq(deckBookmarks.userId, userId)));
  }
  return { bookmarked };
}

/** The signed-in viewer's state for a share page render; one round-trip. */
export async function viewerEngagement(
  deckId: string,
  userId: string,
): Promise<{ liked: boolean; bookmarked: boolean }> {
  const db = getDb();
  const [row] = await db
    .select({
      liked: sql<boolean>`exists (select 1 from ${deckLikes}
        where ${deckLikes.deckId} = ${deckId} and ${deckLikes.userId} = ${userId})`,
      bookmarked: sql<boolean>`exists (select 1 from ${deckBookmarks}
        where ${deckBookmarks.deckId} = ${deckId} and ${deckBookmarks.userId} = ${userId})`,
    })
    .from(sql`(select 1) as one_row`);
  return { liked: row.liked, bookmarked: row.bookmarked };
}
