"use client";

/**
 * Validation panel (P1.4): the adapter's ValidationIssues as a status line +
 * expandable list. Issues that name cards render clickable name chips into the
 * detail pane. Game-ignorant: messages, severities, and card ids all come from
 * the adapter's validate output.
 */
import { useState } from "react";

import type { EditorCard } from "@/lib/decks/editor-state";
import { countIssues } from "@/lib/decks/validation";
import type { ValidationIssue } from "@/lib/games/types";

const CHIP_LIMIT = 5;

interface ValidationPanelProps {
  formatLabel: string;
  issues: ValidationIssue[];
  cards: ReadonlyMap<string, EditorCard>;
  onPreview: (card: EditorCard) => void;
}

export function ValidationPanel({ formatLabel, issues, cards, onPreview }: ValidationPanelProps) {
  const [open, setOpen] = useState(false);
  const { errors, warnings } = countIssues(issues);

  if (issues.length === 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <span aria-hidden>✓</span> Legal {formatLabel} deck
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
          errors > 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"
        }`}
      >
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${errors > 0 ? "bg-destructive" : "bg-amber-500"}`}
        />
        {summary}
        <span aria-hidden className="text-[0.65rem]">
          {open ? "▲" : "▼"}
        </span>
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
