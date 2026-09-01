/**
 * Rendering-side pure helper for the builder's Suggestions panel (P3.2).
 * Not engine code: nothing here scores or filters — this encodes the panel's
 * evidence presentation order, kept pure so it is test-enforced. The refetch
 * policy helpers (deckStateKey, hasLeader) moved to decks/panel-view.ts when
 * the Combo Radar (P3.3) became their second consumer.
 */
import type { Confidence, RecommendationEvidence } from "./types";

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/**
 * Presentation order: strongest evidence first (confidence desc), stable
 * within a tier so the engine's own order (popularity, combos, curve — its
 * weight order) breaks ties. The first entry is the collapsed row's summary.
 */
export function orderEvidence(
  evidence: readonly RecommendationEvidence[],
): RecommendationEvidence[] {
  return [...evidence].sort(
    (a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence],
  );
}
