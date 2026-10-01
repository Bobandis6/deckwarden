/**
 * One budget vocabulary site-wide (Y1, WAVE4 D1): the per-card tiers that
 * Suggestions, the Autofill sheet and the hub staples table all offer, with
 * one inclusive rule — "≤ $5 a card" keeps a card at exactly $5.00, as the
 * engine's SQL (`cheapest_usd <= max`, queries.ts) always has. Unpriced
 * cards never pass a tier: a budget is a claim about a known price.
 */

export type BudgetTier = "all" | "5" | "1";

export const BUDGET_OPTIONS: { value: BudgetTier; label: string }[] = [
  { value: "all", label: "All" },
  { value: "5", label: "≤ $5 a card" },
  { value: "1", label: "≤ $1 a card" },
];

/** True when a card's cheapest known price fits the tier (inclusive). */
export function withinBudget(usd: number | null, tier: BudgetTier): boolean {
  if (tier === "all") return true;
  if (usd === null || !Number.isFinite(usd)) return false;
  return usd <= Number(tier);
}
