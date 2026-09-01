/**
 * Rendering-side pure helpers for the builder's Suggestions panel (P3.2).
 * Not engine code: nothing here scores or filters — these encode the panel's
 * refetch policy and evidence presentation order, kept pure so both are
 * test-enforced.
 */
import type { FormatDef } from "@/lib/games/types";
import type { Confidence, RecommendationEvidence } from "./types";

/** The entry fields the engine's output actually depends on. */
export interface RecsKeyEntry {
  cardId: string;
  zone: string;
  qty: number;
}

/**
 * The panel's refetch key — the engine reads the deck's (card, zone, qty)
 * rows plus the leader-derived ci_mask, all functions of exactly these three
 * fields. Tags, printings, and deck meta are omitted by design: editing them
 * must never refetch. Sorted so entry order (which the editor preserves but
 * the engine ignores) can't cause spurious refetches.
 */
export function recsFetchKey(entries: readonly RecsKeyEntry[]): string {
  return entries
    .map((e) => `${e.cardId}:${e.zone}:${e.qty}`)
    .sort()
    .join("|");
}

/** Whether the deck has a leader-zone card — the panel's fetch gate. */
export function hasLeader(entries: readonly { zone: string }[], format: FormatDef): boolean {
  const leaderZones = new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id));
  return entries.some((e) => leaderZones.has(e.zone));
}

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
