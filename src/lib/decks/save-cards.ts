/**
 * The one place a deck's live card list is written (P3.6 extraction from
 * PUT /api/decks/[id]/cards). Every writer — the editor's autosave PUT and
 * version restore — funnels through here so the decks-table denorms
 * (leader_ids, ci_mask, updated_at) have exactly one implementation. A
 * second copy of the denorm math would be an instant drift bug: the
 * "decks for commander X" hubs read leader_ids, and a restore that
 * recomputed it differently from a save would corrupt them silently.
 *
 * Runs inside the caller's transaction; callers own validation
 * (cardListIssues, card/printing existence) before calling.
 */
import { eq } from "drizzle-orm";

import { schema, type Tx } from "@/db";
import { leaderDenorm, type DeckCardInput } from "@/lib/decks/cards";
import type { FormatDef } from "@/lib/games/types";

const { decks, deckCards } = schema;

export interface SavedDeckCards {
  leaderIds: string[];
  ciMask: number;
  updatedAt: Date;
}

export async function writeDeckCards(
  tx: Tx,
  deckId: string,
  entries: readonly DeckCardInput[],
  format: FormatDef,
  ciMaskByCard: ReadonlyMap<string, number>,
): Promise<SavedDeckCards> {
  const { leaderIds, ciMask } = leaderDenorm([...entries], format, ciMaskByCard);
  const updatedAt = new Date();
  await tx.delete(deckCards).where(eq(deckCards.deckId, deckId));
  if (entries.length > 0) {
    await tx.insert(deckCards).values(
      entries.map((e) => ({
        deckId,
        zone: e.zone,
        cardIdentityId: e.cardId,
        quantity: e.qty,
        printingId: e.printingId ?? null,
        tags: e.tags,
      })),
    );
  }
  await tx.update(decks).set({ leaderIds, ciMask, updatedAt }).where(eq(decks.id, deckId));
  return { leaderIds, ciMask, updatedAt };
}
