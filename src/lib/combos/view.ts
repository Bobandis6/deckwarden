/**
 * Pure classification/presentation helpers for deck-relative combos (P3.3),
 * shared by the Radar route (bucketing) and panel (badges/order) so the
 * semantics live once and stay test-enforced.
 *
 * The template rule is the point (the LATER.md decision this package fired):
 * a combo with named template requirements ("A creature with power 5+") is
 * NEVER "complete" on cards alone — holding every card piece still leaves a
 * requirement open, and saying otherwise would be a false "done". Detection
 * says "also needs …" exactly as the engine's evidence phrasing does
 * (mtgRecommend.combos), and nothing here can promote such a combo to done.
 */

export interface DeckComboLike {
  templates: readonly string[];
  missingPieces: readonly unknown[];
}

export type DeckComboStatus = "complete" | "needs-template" | "one-away";

/**
 * One classifier for every surface. `missingPieces` wins: an absent card is
 * always the first gap to close (the add button's job); templates then keep
 * a fully-carded combo honest.
 */
export function deckComboStatus(combo: DeckComboLike): DeckComboStatus {
  if (combo.missingPieces.length > 0) return "one-away";
  return combo.templates.length > 0 ? "needs-template" : "complete";
}

/**
 * The open template requirements, phrased like the engine's combo evidence
 * ("also needs X, Y") — null when cards are the whole story.
 */
export function alsoNeedsLine(templates: readonly string[]): string | null {
  return templates.length > 0 ? `Also needs ${templates.join(", ")}` : null;
}

const STATUS_ORDER: Record<DeckComboStatus, number> = {
  complete: 0,
  "needs-template": 1,
  "one-away": 2,
};

/**
 * Presentation order for one bucket: truly complete lines first, then
 * template-gated ones — stable within, so the query layer's popularity
 * order (DESC NULLS LAST) keeps ranking the rest.
 */
export function orderDeckCombos<T extends DeckComboLike>(combos: readonly T[]): T[] {
  return [...combos].sort(
    (a, b) => STATUS_ORDER[deckComboStatus(a)] - STATUS_ORDER[deckComboStatus(b)],
  );
}
