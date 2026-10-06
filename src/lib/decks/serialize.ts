/**
 * The deck-meta wire shape shared by every deck route (P1.1).
 *
 * claim_token, created_ip, and user_id never leave the server: the token is
 * returned exactly once by the create route (top-level, beside the deck) and
 * is not queryable again by design.
 *
 * Goals (Y4b, WAVE4 D5): the owner gets every goal; everyone else gets the
 * declared target and the table's exceptions (goals.ts' publicGoals) —
 * never the budget, and never the answers, which only the read can tell
 * apart (Y5's share page computes it and shows the ones that changed it).
 */
import { findFormatById, gameCodeById } from "@/db/seed-data";
import type { schema } from "@/db";
import { publicGoals, readGoals } from "@/lib/decks/goals";

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
    // 'user' | 'precon' (W8a): clients render precons as product lists.
    kind: deck.kind,
    // Owner-only: folder membership is the owner's organization. Non-owners
    // see folder contents solely through a folder page the owner shared.
    folderId: opts.isOwner ? deck.folderId : null,
    goals: opts.isOwner ? readGoals(deck.goals) : publicGoals(readGoals(deck.goals)),
    leaderIds: deck.leaderIds,
    ciMask: deck.ciMask,
    currentVersion: deck.currentVersion,
    likesCount: deck.likesCount,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    isOwner: opts.isOwner,
  };
}
