/**
 * Hub curve block (P2.4): the mana-value distribution of a leader's staples
 * — "computed from card data" per the cold-start rule, not a deck stat.
 * Pure; mirrors the deck analytics curve conventions (analyze.ts): lands
 * excluded, buckets 0–7+, same histogram block shape so AnalyticsBlocks
 * renders it unchanged.
 */
import type { AnalyticsBlock } from "@/lib/games/types";

export interface CurveInput {
  primaryType: string | null;
  costValue: number | null;
}

export function staplesCurveBlock(staples: CurveInput[]): AnalyticsBlock | null {
  const buckets = new Array(8).fill(0) as number[];
  let counted = 0;
  for (const s of staples) {
    if (s.primaryType === "Land" || s.costValue === null) continue;
    buckets[Math.min(7, Math.max(0, s.costValue))]++;
    counted++;
  }
  if (counted === 0) return null;
  return {
    kind: "histogram",
    id: "staples-curve",
    title: "Curve of these staples",
    buckets: buckets.map((value, mv) => ({ label: mv === 7 ? "7+" : String(mv), value })),
  };
}
