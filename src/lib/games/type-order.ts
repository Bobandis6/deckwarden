/**
 * Where a card-type group sits in a game's declared display order
 * (DECK-TOKENS, `display.typeOrder` in types.ts). Shared by the deck views
 * (src/lib/decks/view-model.ts) and an adapter's own type breakdown, so the
 * list and the chart beside it read in one order — the colors.ts division of
 * labor: one cross-game helper both sides import, no game module needed.
 *
 * Listed types take their index; a type the order doesn't list comes after
 * all of them (callers tiebreak those by label); cards with no type at all
 * ("Other") come last of everything.
 */

/** The group label for a card whose primaryType is null. */
export const NO_TYPE_LABEL = "Other";

export function typeGroupRank(order: readonly string[], type: string): number {
  if (type === NO_TYPE_LABEL) return order.length + 1;
  const at = order.indexOf(type);
  return at < 0 ? order.length : at;
}
