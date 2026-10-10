/**
 * Goals in Suggestions (Y6a, WAVE4 D7) — one pure step after ranking: the
 * engine ranks every candidate, `applyGoals` checks them against the deck's
 * goals in rank order, and the list is cut to its limit only then (rank all
 * → goals → slice), so a card the goals take out is replaced by the next
 * one, never by a shorter list.
 *
 * What it checks, all four card rules plus the budget:
 * - the bracket rules through the adapter's `brackets.impact` (Magic: Game
 *   Changers over the allowance, mass land denial, a second extra-turn
 *   card, combo completions) against the list's own read — core names no
 *   rule. With a target, each reason a card sits above it hides the card;
 *   with none, what would raise the line is a flag ("Would make this deck
 *   at least Bracket 3 — a Game Changer"), and nothing is hidden;
 * - the deck's per-card budget (the owner's, never a visitor's): a card
 *   over it is flagged ("Costs $45.00 — over your ≤ $5 a card budget").
 *   It only shows when the panel's own budget is wider than the goal — the
 *   panel's choice filters in SQL, as it always has.
 *
 * Conflicts are kept apart from evidence and never scored: every row keeps
 * its rank, its score and its evidence exactly as ranked; `conflicts` sits
 * beside them. Hidden rows are counted — the ones that ranked above the
 * list's last row, the cards these goals took out of it — and returned, so
 * the panel can show them with their reasons.
 */
import type { DeckGoals } from "@/lib/decks/goals";
import type {
  BracketInput,
  BracketRead,
  BracketsMeta,
  CardData,
  CompleteCombo,
} from "@/lib/games/types";
import { BUDGET_OPTIONS, withinBudget, type BudgetTier } from "./budget";
import type { Recommendation } from "./types";

export interface GoalConflict {
  /** The adapter's rule ("game-changers", "land-denial", "extra-turns", "combo") or core's "budget". */
  rule: string;
  /** The named source (D0). */
  source: string;
  /** One plain line. */
  why: string;
  /** hide = out of the list, counted behind "N hidden by your goals · Show"; flag = shown with its line. */
  severity: "hide" | "flag";
}

/** A recommendation as Suggestions get it (Y6a): unchanged, with its goal conflicts beside the evidence. */
export type GoaledRecommendation = Recommendation & { conflicts: GoalConflict[] };

/** What the goals check knows of the list, built once per request on the server. */
export interface GoalsRead {
  /** The adapter's input — the list, its cards (their declared flags), its complete combos. */
  input: BracketInput;
  /** `assess(input)` — the list as it stands. */
  read: BracketRead;
  /** Each candidate as the read sees it: its card, and the combos it would complete. */
  candidates: ReadonlyMap<string, { card: CardData; completes: readonly CompleteCombo[] }>;
}

export interface GoalsOutcome {
  /** The list: rank order, at most `limit` — flagged rows included. */
  kept: GoaledRecommendation[];
  /** How many of `kept` carry a flag. */
  flagged: number;
  /** Hidden by the goals, rank order: the cards that ranked above the list's last row. */
  hidden: GoaledRecommendation[];
}

/** The goals this check reads: the target, the per-card budget, the answers (they move the line). */
export type SuggestionGoals = Pick<DeckGoals, "targetLevel" | "budget" | "answers">;

/** The price source a budget line names. */
export const PRICE_SOURCE = "Card price";

/**
 * The per-card budget's line, or null when the card fits it (budget.ts'
 * inclusive rule; an unpriced card never fits a budget — it is a claim
 * about a known price).
 */
export function budgetConflict(
  rec: Pick<Recommendation, "cheapestUsd">,
  perCardUsd: number | undefined,
): GoalConflict | null {
  if (perCardUsd === undefined) return null;
  const tier = String(perCardUsd) as BudgetTier;
  const usd = rec.cheapestUsd === null ? null : Number(rec.cheapestUsd);
  if (withinBudget(usd, tier)) return null;
  const label = BUDGET_OPTIONS.find((o) => o.value === tier)?.label ?? `≤ $${perCardUsd} a card`;
  return {
    rule: "budget",
    source: PRICE_SOURCE,
    severity: "flag",
    why:
      usd === null || !Number.isFinite(usd)
        ? `No known price — your budget is ${label}`
        : `Costs $${usd.toFixed(2)} — over your ${label} budget`,
  };
}

/**
 * The goals step: in rank order, each card's conflicts — the adapter's
 * (`meta.impact`, against `read`) and the budget's — until `limit` cards
 * are kept. A card with any reason above the target is hidden; flags stay
 * on the row. `read` null (a game without brackets, a list without a
 * commander) or `meta` absent = the budget alone.
 */
export function applyGoals(
  ranked: readonly Recommendation[],
  goals: SuggestionGoals | null,
  read: GoalsRead | null,
  meta: Pick<BracketsMeta, "impact"> | undefined,
  limit: number,
): GoalsOutcome {
  const targetLevel = goals?.targetLevel ?? null;
  const perCardUsd = goals?.budget?.perCardUsd;
  const kept: GoaledRecommendation[] = [];
  const hidden: GoaledRecommendation[] = [];
  let flagged = 0;
  for (const rec of ranked) {
    if (kept.length >= limit) break;
    const conflicts: GoalConflict[] = [];
    const facts = read?.candidates.get(rec.cardId);
    if (meta && read && facts) {
      const found = meta.impact({
        ...read.input,
        targetLevel,
        read: read.read,
        card: facts.card,
        completes: facts.completes,
      });
      for (const c of found) {
        conflicts.push({
          rule: c.rule,
          source: c.source,
          why: c.why,
          // No target, nothing hidden: what a card would do is a flag (D7).
          severity: targetLevel !== null ? "hide" : "flag",
        });
      }
    }
    const budget = budgetConflict(rec, perCardUsd);
    if (budget) conflicts.push(budget);
    const row: GoaledRecommendation = { ...rec, conflicts };
    if (conflicts.some((c) => c.severity === "hide")) {
      hidden.push(row);
    } else {
      kept.push(row);
      if (conflicts.length > 0) flagged++;
    }
  }
  return { kept, flagged, hidden };
}
