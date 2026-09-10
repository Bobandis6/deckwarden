/**
 * Server-side leader art for a deck (R2, REDESIGN.md §3): what the share
 * page resolves during its render so the client makes zero art requests —
 * the same decisions the endpoint makes, in the same order: the adapter
 * gate first (a game without ambient art never looks up a printing, never
 * reaches Scryfall), then the art leader's chosen printing from the wire or
 * the identity's default, then the resolver (null without an artist).
 *
 * Caching intent: the Scryfall call inside is data-cached daily per
 * printing (src/lib/cards/art.ts); the two DB reads are the deck's own.
 */
import { ambientArtKind, resolveCardArt, type CardArt } from "@/lib/cards/art";
import { leaderArtTarget, orderLeadersBy } from "@/lib/decks/ambient-art";
import type { FormatDef, GameAdapter } from "@/lib/games/types";
import { loadDefaultPrinting } from "@/lib/hub/queries";

export async function loadDeckLeaderArt(
  deck: { leaderIds: string[] },
  cards: readonly { cardId: string; zone: string; printingId: string | null }[],
  { adapter, format }: { adapter: GameAdapter; format: FormatDef },
): Promise<CardArt | null> {
  if (ambientArtKind(adapter) === null) return null;
  const target = leaderArtTarget(orderLeadersBy(cards, format, deck.leaderIds), format);
  if (!target) return null;
  const printingId = target.printingId ?? (await loadDefaultPrinting(target.cardId))?.id ?? null;
  if (!printingId) return null;
  return resolveCardArt(adapter, printingId);
}
