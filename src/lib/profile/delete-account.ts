/**
 * Account deletion (P2.8, fired LATER row). One transaction, ordered by the
 * FK graph:
 *
 *   1. Recount likes: decrement decks.likes_count for every deck this user
 *      liked. The user-row delete cascades their deck_likes rows WITHOUT
 *      touching the denorm — exactly the drift the engagement code's
 *      greatest() guard can only cap at zero, never repair. One decrement
 *      per deck is exact ((deck_id, user_id) is the PK). Decks the user
 *      liked that they also own get deleted in step 3, so the wasted
 *      decrement there is harmless.
 *   2. Detach forks: null forked_from_deck_id on other people's decks that
 *      fork this user's decks. Nothing writes forks until M3, but the FK has
 *      no ON DELETE and a single referencing row would abort the whole
 *      transaction the day forks exist.
 *   3. Delete the user's decks. decks.user_id deliberately has no ON DELETE
 *      (nothing implicit may eat decks), so the user row can't go first.
 *      Deletion rather than orphaning: an orphaned deck (user_id NULL, no
 *      claim token) would be uneditable forever and the anon purge would
 *      reap it inside 12 months anyway — and "delete my account" should
 *      mean the decks too, which is what the privacy page now promises.
 *      The cascade takes deck_cards, deck_versions, and other people's
 *      likes/bookmarks ON those decks (their denorms die with the rows).
 *   4. Delete the user row — cascades sessions, accounts, folders (which
 *      SET NULL any surviving decks' folder_id — there are none by now),
 *      and the user's like/bookmark rows on other people's decks (already
 *      recounted in step 1).
 */
import { eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

const { decks, deckLikes, users } = schema;

export async function deleteAccount(userId: string): Promise<{ decksDeleted: number }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const liked = await tx
      .select({ deckId: deckLikes.deckId })
      .from(deckLikes)
      .where(eq(deckLikes.userId, userId));
    if (liked.length > 0) {
      await tx
        .update(decks)
        .set({ likesCount: sql`greatest(${decks.likesCount} - 1, 0)` })
        .where(
          inArray(
            decks.id,
            liked.map((row) => row.deckId),
          ),
        );
    }

    const owned = await tx.select({ id: decks.id }).from(decks).where(eq(decks.userId, userId));
    if (owned.length > 0) {
      const ownedIds = owned.map((row) => row.id);
      await tx
        .update(decks)
        .set({ forkedFromDeckId: null })
        .where(inArray(decks.forkedFromDeckId, ownedIds));
      await tx.delete(decks).where(inArray(decks.id, ownedIds));
    }

    await tx.delete(users).where(eq(users.id, userId));
    return { decksDeleted: owned.length };
  });
}
