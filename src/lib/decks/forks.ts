/**
 * Forks (P3.6): a copy of someone's deck, credited to its upstream via
 * decks.forked_from_deck_id (provisioned P1.1).
 *
 * Who may fork (decision 3): ACCOUNTS ONLY. Guest decks exist by design,
 * but a fork is a one-click row mint against a public list — the widest
 * spam surface the site has — and the deck-create limiter is per-IP only.
 * Session-gating keys the limit on the user id and keeps a botnet from
 * cloning every public deck a thousand times. Guests can still copy the
 * decklist and import it; they just don't get the credit line.
 *
 * What copies: name + the live card list (zones, quantities, tags, chosen
 * printings) + the leader_ids/ci_mask denorms (same list, same denorm).
 * NOT copied: likes, bookmarks, versions, logged games (Y9a — a journal is
 * its owner's record of their own games), description/notes (the author's
 * prose), visibility (forks are born unlisted like every create), claim
 * state (the forker's session is the ownership proof), goals (Y4b — the
 * target, answers and budget are the upstream owner's; the explicit
 * columns below leave them NULL, forks.test.ts). Forking your own
 * deck is allowed — it's a duplicate with provenance.
 *
 * Precon lineage (PRECON-OWNED): a fork OF A PRECON is a deck started from
 * it, so precon_deck_id = the upstream's id and the editor asks "Do you own
 * this precon?". A fork of a user's deck inherits nothing, even when that
 * deck started from a precon: its lineage and its owner's answer (owns_precon)
 * are the upstream owner's, so neither column is named and both stay NULL.
 *
 * Baseline for "changes since you forked" (decision 4): the fork's VERSION
 * 1 is the upstream's list at fork time, note "Forked from <name>". No
 * forked_from_version column, no migration: the baseline is frozen forever
 * even if the upstream churns, goes private, or is deleted, and the
 * package's own diff renders it. Cost: one version slot of the fork's cap.
 *
 * Credit states (rendered on /d/[publicId] and in the editor):
 *   linked  — this viewer may be told where the upstream lives: "Forked from
 *             <name>" links its share page. A public upstream links for
 *             everyone; an unlisted one for its owner, for the fork's owner
 *             (who had the link) and for the readers of a fork that isn't
 *             public (its link is the same reachability class, P2.2's
 *             reasoning).
 *   private — everyone else: credit without name or link. A private deck's
 *             NAME is its owner's private data, and a public fork is
 *             browsable (the sitemap, the home rail, crawlers), so its page
 *             shows a stranger public upstreams only — folderDeckVisibilities'
 *             rule (S6), applied to the credit by the 2026-10-30 security
 *             audit (its fork-credit record): before it the anchor to an
 *             unlisted upstream sat on an indexable page for every reader.
 *             The line reads "a deck that isn't public", which covers both.
 *   (none)  — upstream deleted: every delete path NULLs the pointer (the
 *             self-FK has no ON DELETE), so the deck simply stops being a
 *             fork in the data model. The frozen v1 keeps the provenance in
 *             the owner's history.
 */
import { eq, inArray } from "drizzle-orm";

import { getDb, schema, type Db, type DbExecutor } from "@/db";
import { canReadDeck, isDeckOwner, type DeckAccessRow } from "@/lib/decks/access";
import type { ForkCredit } from "@/lib/decks/fork-credit";
import { newPublicId } from "@/lib/decks/public-id";
import type { DeckRow } from "@/lib/decks/serialize";
import { insertVersion, loadLiveFrozen, lockDeck } from "@/lib/decks/versions";

const { decks, deckCards } = schema;

export type { ForkCredit };

export async function forkCredit(
  deck: { forkedFromDeckId: string | null } & DeckAccessRow,
  viewer: { token: string | null; userId: string | null },
): Promise<ForkCredit | null> {
  if (!deck.forkedFromDeckId) return null;
  const db = getDb();
  const [upstream] = await db
    .select({
      publicId: decks.publicId,
      name: decks.name,
      userId: decks.userId,
      claimToken: decks.claimToken,
      visibility: decks.visibility,
    })
    .from(decks)
    .where(eq(decks.id, deck.forkedFromDeckId))
    .limit(1);
  // Pointer to a missing row can't happen (the FK), but stay honest if it did.
  if (!upstream) return null;
  if (!canReadDeck(upstream, viewer.token, viewer.userId)) return { state: "private" };
  // A public fork is browsable, so a stranger reading it gets folderDeckVisibilities'
  // answer: public upstreams only. The link to an unlisted upstream goes to its owner
  // and to the fork's owner, who had it; an unlisted or private fork's readers hold a
  // link of the same reachability class already (the header comment).
  if (
    upstream.visibility === "unlisted" &&
    deck.visibility === "public" &&
    !isDeckOwner(upstream, viewer.token, viewer.userId) &&
    !isDeckOwner(deck, viewer.token, viewer.userId)
  ) {
    return { state: "private" };
  }
  return { state: "linked", publicId: upstream.publicId, name: upstream.name };
}

export async function forkDeck(
  upstream: DeckRow,
  opts: { userId: string; ip: string | null },
): Promise<DeckRow> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Lock the upstream so the copied list and the v1 baseline are the same
    // snapshot even if its owner is mid-autosave.
    await lockDeck(tx, upstream.id);
    const live = await loadLiveFrozen(tx, upstream.id);
    const [fork] = await tx
      .insert(decks)
      .values({
        publicId: newPublicId(),
        gameId: upstream.gameId,
        formatId: upstream.formatId,
        userId: opts.userId,
        claimToken: null,
        createdIp: opts.ip,
        name: upstream.name,
        visibility: "unlisted",
        leaderIds: upstream.leaderIds,
        ciMask: upstream.ciMask,
        forkedFromDeckId: upstream.id,
        ...(upstream.kind === "precon" ? { preconDeckId: upstream.id } : {}),
      })
      .returning();
    if (live.length > 0) {
      await tx.insert(deckCards).values(
        live.map((c) => ({
          deckId: fork.id,
          zone: c.zone,
          cardIdentityId: c.cardId,
          quantity: c.qty,
          printingId: c.printingId,
          tags: c.tags,
        })),
      );
    }
    // The new row is invisible to other transactions, so no lock is needed
    // for its first version; current_version 0 -> 1.
    await insertVersion(tx, fork.id, live, `Forked from “${upstream.name}”`);
    const [withVersion] = await tx.select().from(decks).where(eq(decks.id, fork.id)).limit(1);
    return withVersion;
  });
}

/**
 * Delete decks without tripping the fork self-FK: NULL dependents' pointers
 * first, in the caller's transaction. Every delete path uses this — the
 * single-deck DELETE, account deletion, the nightly anon purge. Mirrors
 * delete-account.ts's original steps 2-3.
 */
export async function detachForksAndDeleteDecks(
  executor: DbExecutor,
  deckIds: readonly string[],
): Promise<number> {
  if (deckIds.length === 0) return 0;
  const ids = [...deckIds];
  await executor
    .update(decks)
    .set({ forkedFromDeckId: null })
    .where(inArray(decks.forkedFromDeckId, ids));
  const deleted = await executor.delete(decks).where(inArray(decks.id, ids)).returning({
    id: decks.id,
  });
  return deleted.length;
}

/** Transactional wrapper for callers that aren't already inside one. */
export async function deleteDecksForkSafe(db: Db, deckIds: readonly string[]): Promise<number> {
  return db.transaction((tx) => detachForksAndDeleteDecks(tx, deckIds));
}
