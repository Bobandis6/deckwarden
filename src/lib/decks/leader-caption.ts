/**
 * Leader captions (R3 → R5b): the printed id and stat line a leader card
 * carries beside its name — "OP15-058 · 5000 Power · 5 Life" for One
 * Piece, "3/4" for a Magic commander — read through the adapter's display
 * contract, never hand-rolled in core. `LeaderZone` renders the caption
 * under each card; the share page's artwork header renders `leaderLine`,
 * every leader with its caption, partners joined with " & " in the deck's
 * leader order. Pure, no IO.
 */
import type { CardData, GameAdapter } from "@/lib/games/types";

type Display = Pick<GameAdapter, "display">;

/** "OP15-058 · 5000 Power · 5 Life", "3/4", or "" when the adapter declares neither. */
export function leaderCaption(adapter: Display | undefined, card: CardData): string {
  if (!adapter) return "";
  return [adapter.display.idBadge?.(card), adapter.display.statLine?.(card)]
    .filter(Boolean)
    .join(" · ");
}

/** "Enel · OP15-058 · 5000 Power · 5 Life"; partners: "A · 2/2 & B · 3/3". */
export function leaderLine(adapter: Display, cards: readonly CardData[]): string {
  return cards
    .map((card) => [card.name, leaderCaption(adapter, card)].filter(Boolean).join(" · "))
    .join(" & ");
}
