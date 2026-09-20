/**
 * MTG buy capability (W7): TCGplayer strings, pure and declarative — core
 * (src/lib/buy/) turns these into Mass Entry menus and single-card links.
 *
 * Name rule, live-verified on tcgplayer.com/massentry 2026-09-20 (the
 * contract's sketch said "mana_cost has ' // ' → full name"; the live form
 * rejected full ADVENTURE names, so the live site won):
 *   - split/aftermath/room ("Wear // Tear", "Fire // Ice" — combined
 *     top-level mana_cost, scryfall-map.ts:209): FULL name parses ✓
 *   - adventure/omen ("Bonecrusher Giant // Stomp" ✗ full, ✓ front): the
 *     spell half is attached to one card TCGplayer names by its front face —
 *     these also have a combined mana_cost, told apart by "Adventure"/"Omen"
 *     in the type_line's second half
 *   - transform/MDFC ("Delver of Secrets" ✓): attrs.mana_cost is the front
 *     face's (never " // "-joined) → front-face name
 * MtgAttrs has no `layout`; mana_cost + type_line are the honest stand-ins.
 */
import type { CardData } from "@/lib/games/types";

import type { MtgAttrs } from "./attrs";

type BuyCard = Omit<CardData<MtgAttrs>, "legality">;

const NAME_JOIN = " // ";

/** The vendor-parsable product name per the rule above. */
export function tcgplayerName(card: BuyCard): string {
  if (!card.name.includes(NAME_JOIN)) return card.name;
  const { mana_cost, type_line } = card.attrs;
  const bothCostsOnOneFace = mana_cost !== undefined && mana_cost.includes(NAME_JOIN);
  const attachedSpellHalf = /\b(Adventure|Omen)\b/.test(type_line);
  if (bothCostsOnOneFace && !attachedSpellHalf) return card.name;
  return card.name.split(NAME_JOIN)[0];
}

export function massEntryLine(card: BuyCard, qty: number): string {
  return `${qty} ${tcgplayerName(card)}`;
}

/** Name-search results page — exact-printing deep links are a LATER row. */
export function cardUrl(card: BuyCard): string {
  return `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(tcgplayerName(card))}`;
}

/** D6's "Without basic lands": Basic supertype on the printed type line. */
export function skipByDefault(card: BuyCard): boolean {
  return card.attrs.type_line.includes("Basic");
}

/** The declaration spread into the adapter's `capabilities.buy`. */
export const mtgBuy = {
  vendor: "TCGplayer",
  // "Magic" (not "magic") is what the live massentry form's select latches on.
  productLine: "Magic",
  massEntryLine,
  cardUrl,
  skipByDefault,
};
