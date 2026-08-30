/**
 * Deck curve for OG images (P2.6). Pure; mirrors analyzeMtg's histogram
 * conventions exactly (buckets 0–7+, lands excluded, null cost counted at
 * 0, quantity-weighted) so the unfurl never disagrees with the share page's
 * analytics block. Uses only the promoted cross-game fields (primaryType,
 * costValue), same as hub/curve.ts.
 */
export interface OgCurveRow {
  primaryType: string | null;
  costValue: number | null;
  qty: number;
}

export function ogCurveBuckets(rows: OgCurveRow[]): number[] {
  const buckets = new Array<number>(8).fill(0);
  for (const r of rows) {
    if (r.primaryType === "Land") continue;
    buckets[Math.min(Math.max(r.costValue ?? 0, 0), 7)] += r.qty;
  }
  return buckets;
}
