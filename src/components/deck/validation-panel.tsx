"use client";

/**
 * Validation panel (P1.4): the adapter's ValidationIssues as a status line +
 * expandable list. Issues that name cards render clickable name chips into the
 * detail pane. Game-ignorant: messages, severities, and card ids all come from
 * the adapter's validate output.
 *
 * R3 (F1, build plan §10): the zero-issue line is the Warden's — "The Warden
 * approves this deck ✓" as a `role="status"` region, the shield settling
 * once (≤ 300 ms, motion-safe) ONLY when validation goes from some issues to
 * none. Never on mount — the share page shows the same line statically — and
 * never re-triggered by unrelated edits: a name edit, a tag edit, a View
 * toggle or a theme switch re-render with the same `zero`, and the
 * previous-render comparison below stays false. An empty deck never gets
 * the line at all: both adapters emit DECK_SIZE under the minimum.
 *
 * R5b (F5): `preview` wraps each card-name chip in the share page's hover
 * and focus card preview; the editor's instance passes nothing and keeps
 * plain chips (its detail pane already previews).
 *
 * Y2a (WAVE4 D2, progress not problems): with a `progress` line (the
 * editor's, from `src/lib/decks/progress.ts`), issues the adapter flagged
 * `progress` — an empty leader zone, a deck under its minimum — leave the
 * red count and render as that one neutral line instead; real problems
 * stay red beneath it. The Warden line is unchanged: flagged issues are
 * still issues, so an empty deck never gets it. Without the prop (the
 * share page) every issue renders as before.
 *
 * Y2b (WAVE4 D2, first approval): `approvalAction` — the editor's one
 * "Share this deck" — renders UNDER the Warden line, never in it: the line
 * stays legality-only. Without it (the share page) the approved markup is
 * the same single line as before.
 */
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { CardNamePreview } from "@/components/deck/card-name-preview";
import type { EditorCard } from "@/lib/decks/editor-state";
import { isProgressIssue } from "@/lib/decks/progress";
import { countIssues } from "@/lib/decks/validation";
import type { ValidationIssue } from "@/lib/games/types";
import { cn } from "@/lib/utils";

const CHIP_LIMIT = 5;

interface ValidationPanelProps {
  formatLabel: string;
  issues: ValidationIssue[];
  cards: ReadonlyMap<string, EditorCard>;
  onPreview: (card: EditorCard) => void;
  /** Share pages: hover / focus card previews on the name chips (F5). */
  preview?: boolean;
  /**
   * The editor's progress line (Y2a) — "Choose a commander · 100 to go".
   * A string moves flagged issues out of the problem count into this line;
   * null or absent renders every issue as a problem (the share page).
   */
  progress?: string | null;
  /** Under the Warden line while the deck is approved (Y2b: the editor's "Share this deck"). */
  approvalAction?: ReactNode;
}

export function ValidationPanel({
  formatLabel,
  issues,
  cards,
  onPreview,
  preview = false,
  progress = null,
  approvalAction,
}: ValidationPanelProps) {
  const [open, setOpen] = useState(false);
  const zero = issues.length === 0;
  // "Storing information from previous renders" (react.dev): the settle key
  // bumps only when this render's `zero` flipped from false — so a mount at
  // zero (share page) and every unrelated re-render leave it alone, and a
  // fresh key remounts the mark so the one-shot animation plays again.
  const [prevZero, setPrevZero] = useState(zero);
  const [settleKey, setSettleKey] = useState(0);
  if (prevZero !== zero) {
    setPrevZero(zero);
    if (zero) setSettleKey((k) => k + 1);
  }
  // Progress (Y2a) leaves the problem list only when there is a line to say it.
  const problems = progress !== null ? issues.filter((i) => !isProgressIssue(i)) : issues;
  const { errors, warnings } = countIssues(problems);

  if (zero) {
    const settle = settleKey > 0;
    const line = (
      <p
        role="status"
        title={`Legal ${formatLabel} deck`}
        data-settled={settle || undefined}
        className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
      >
        <BrandMark
          key={settleKey}
          variant="shield"
          className={cn(
            "size-4 shrink-0",
            settle &&
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-300",
          )}
        />
        <span
          key={`line-${settleKey}`}
          className={cn(
            "font-display",
            settle && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
          )}
        >
          The Warden approves this deck <span aria-hidden>✓</span>
        </span>
      </p>
    );
    if (!approvalAction) return line;
    // Indented to the line's text: the shield's 16 px plus the 6 px gap.
    return (
      <div>
        {line}
        <div data-slot="approval-action" className="mt-0.5 pl-5.5 text-xs">
          {approvalAction}
        </div>
      </div>
    );
  }

  const summary = [
    errors > 0 ? `${errors} problem${errors === 1 ? "" : "s"}` : "",
    warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-2">
      {progress !== null && (
        <p
          data-slot="progress-line"
          className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
        >
          <span aria-hidden className="bg-muted-foreground/60 size-1.5 rounded-full" />
          {progress}
        </p>
      )}
      {problems.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded text-xs font-medium hover:underline pointer-coarse:min-h-11 ${
              errors > 0 ? "text-destructive" : "text-amber-700 dark:text-amber-400"
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${errors > 0 ? "bg-destructive" : "bg-amber-500"}`}
            />
            {summary}
            {open ? (
              <ChevronUpIcon aria-hidden className="size-3.5" />
            ) : (
              <ChevronDownIcon aria-hidden className="size-3.5" />
            )}
          </button>

          {open && (
            <ul className="mt-1.5 space-y-1.5">
              {problems.map((issue, i) => (
                <li key={`${issue.code}:${issue.zone ?? ""}:${i}`} className="text-xs">
                  <span className="flex items-start gap-1.5">
                    <span
                      aria-hidden
                      className={`mt-1 size-1.5 shrink-0 rounded-full ${
                        issue.severity === "error" ? "bg-destructive" : "bg-amber-500"
                      }`}
                    />
                    <span>
                      <span className="sr-only">
                        {issue.severity === "error" ? "Error: " : "Warning: "}
                      </span>
                      {issue.message}
                    </span>
                  </span>
                  {issue.cardIds && issue.cardIds.length > 0 && (
                    <span className="mt-0.5 ml-3 flex flex-wrap gap-1">
                      {issue.cardIds.slice(0, CHIP_LIMIT).map((cardId) => {
                        const card = cards.get(cardId);
                        if (!card) return null;
                        const chip = (
                          <button
                            key={cardId}
                            type="button"
                            onClick={() => onPreview(card)}
                            className="bg-muted hover:bg-muted/70 inline-flex items-center rounded px-1.5 py-0.5 hover:underline pointer-coarse:min-h-11 pointer-coarse:px-3"
                          >
                            {card.name}
                          </button>
                        );
                        return preview ? (
                          <CardNamePreview key={cardId} name={card.name} image={card.image}>
                            {chip}
                          </CardNamePreview>
                        ) : (
                          chip
                        );
                      })}
                      {issue.cardIds.length > CHIP_LIMIT && (
                        <span className="text-muted-foreground px-1 py-0.5">
                          +{issue.cardIds.length - CHIP_LIMIT} more
                        </span>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
