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
 */
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import type { EditorCard } from "@/lib/decks/editor-state";
import { countIssues } from "@/lib/decks/validation";
import type { ValidationIssue } from "@/lib/games/types";
import { cn } from "@/lib/utils";

const CHIP_LIMIT = 5;

interface ValidationPanelProps {
  formatLabel: string;
  issues: ValidationIssue[];
  cards: ReadonlyMap<string, EditorCard>;
  onPreview: (card: EditorCard) => void;
}

export function ValidationPanel({ formatLabel, issues, cards, onPreview }: ValidationPanelProps) {
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
  const { errors, warnings } = countIssues(issues);

  if (zero) {
    const settle = settleKey > 0;
    return (
      <p
        role="status"
        title={`Legal ${formatLabel} deck`}
        data-settled={settle || undefined}
        className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
      >
        <BrandMark
          key={settleKey}
          className={cn(
            "size-4 shrink-0",
            settle &&
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-300",
          )}
        />
        <span
          key={`line-${settleKey}`}
          className={cn(
            settle && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
          )}
        >
          The Warden approves this deck <span aria-hidden>✓</span>
        </span>
      </p>
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
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded text-xs font-medium hover:underline ${
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
          {issues.map((issue, i) => (
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
                    return (
                      <button
                        key={cardId}
                        type="button"
                        onClick={() => onPreview(card)}
                        className="bg-muted hover:bg-muted/70 rounded px-1.5 py-0.5 hover:underline"
                      >
                        {card.name}
                      </button>
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
    </div>
  );
}
