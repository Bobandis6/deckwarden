"use client";

/**
 * The goals line (Y6a, WAVE4 D7) — what the deck aims at, in one quiet line
 * atop Suggestions and the Why sheet: "Your goals: Bracket 2 (Core), ≤ $5
 * a card" and Change (U9: one dot a line, a control after a gap). With no
 * target and no budget it is LATER row 175's door — "No bracket target
 * yet" and "Set one" — so a target can be declared
 * before the list has found anything (the bracket line offers no "Why?"
 * until it has). The action opens Your target; without one the line only
 * reads. A game without `brackets` shows its budget, or nothing — never a
 * bracket word (D0's adapter gating).
 *
 * Y8 (WAVE4 D9): a deck total reads as its running estimate — "est. $212 of
 * your $150" — wherever the line appears (`estimate` from the editor; the
 * owner's own line only: the budget never reaches a visitor). Over the
 * total, `onFit` adds "Fit my budget", the Fit sheet's door.
 */
import { BRACKET_COPY, goalsParts } from "@/lib/brackets/copy";
import type { DeckGoals } from "@/lib/decks/goals";
import type { BracketsMeta } from "@/lib/games/types";
import { BUDGET_OPTIONS, tierOf } from "@/lib/recommend/budget";
import { FIT_COPY, totalPhrase, type FitEstimate } from "@/lib/recommend/fit";
import { cn } from "@/lib/utils";

/** "≤ $5 a card" — the site's one budget vocabulary (budget.ts). */
export const budgetLabel = (perCardUsd: number) =>
  BUDGET_OPTIONS.find((o) => o.value === tierOf(perCardUsd))?.label ?? `≤ $${perCardUsd} a card`;

const ACTION =
  "text-foreground ml-1 cursor-pointer font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export function GoalsLine({
  brackets,
  goals,
  estimate = null,
  onChange,
  onFit,
  className,
}: {
  /** The adapter's `brackets`; absent = a game without them (the budget alone). */
  brackets: Pick<BracketsMeta, "noun" | "levels"> | undefined;
  goals: DeckGoals | null;
  /** Y8: the deck's estimate beside its total; null = "$150 total". */
  estimate?: FitEstimate | null;
  /** "Change" / "Set one" — opens Your target. Absent, the line only reads. */
  onChange?: () => void;
  /** Y8: "Fit my budget" — shown while the estimate is over the total. */
  onFit?: () => void;
  className?: string;
}) {
  const parts = goalsParts(brackets, goals, budgetLabel, (total) => totalPhrase(total, estimate));
  const total = goals?.budget?.totalUsd;
  const over = total !== undefined && estimate !== null && estimate.usd > total;
  if (parts.length === 0 && !brackets) return null;
  const action =
    brackets && onChange
      ? parts.length > 0
        ? BRACKET_COPY.changeGoals
        : BRACKET_COPY.setTarget
      : null;
  return (
    <p data-slot="goals-line" className={cn("text-muted-foreground text-xs", className)}>
      {parts.length > 0
        ? `${BRACKET_COPY.goalsLead} ${parts.join(", ")}`
        : BRACKET_COPY.noTarget(brackets!.noun)}
      {onFit && over && (
        <>
          {" "}
          <button type="button" onClick={onFit} className={ACTION}>
            {FIT_COPY.door}
          </button>
        </>
      )}
      {action && (
        <>
          {" "}
          <button type="button" onClick={onChange} className={ACTION}>
            {action}
          </button>
        </>
      )}
    </p>
  );
}
