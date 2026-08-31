/**
 * The deck-meta wire shape shared by every deck route (P1.1).
 *
 * claim_token, created_ip, and user_id never leave the server: the token is
 * returned exactly once by the create route (top-level, beside the deck) and
 * is not queryable again by design.
 */
import { findFormatById, gameCodeById } from "@/db/seed-data";
import type { schema } from "@/db";

export type DeckRow = typeof schema.decks.$inferSelect;

export function deckMetaJson(deck: DeckRow, opts: { isOwner: boolean }) {
  return {
    id: deck.id,
    publicId: deck.publicId,
    game: gameCodeById(deck.gameId) ?? null,
    format: findFormatById(deck.formatId)?.code ?? null,
    name: deck.name,
    description: deck.description,
    notes: deck.notes,
    visibility: deck.visibility,
    // Owner-only: folder membership is the owner's organization. Non-owners
    // see folder contents solely through a folder page the owner shared.
    folderId: opts.isOwner ? deck.folderId : null,
    leaderIds: deck.leaderIds,
    ciMask: deck.ciMask,
    currentVersion: deck.currentVersion,
    likesCount: deck.likesCount,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    isOwner: opts.isOwner,
  };
}
