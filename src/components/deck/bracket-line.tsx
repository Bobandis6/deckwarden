"use client";

/**
 * The bracket line (Y4a, WAVE4 D5): the deck's read in one line on the
 * legality line, directly after the ValidationPanel — "At least Bracket 3
 * (Upgraded) · Why?". Adapter-gated: a game without `brackets` (One Piece)
 * renders nothing, and no apology. The words are the adapter's
 * (`brackets.line`), the order of core's own lines is bracketLineView's,
 * and "Why?" opens the Why sheet (the editor's "bracket" dialog).
 *
 * Neutral by design: muted text with a gauge glyph, never a color or a
 * badge — a bracket is not a problem, and status is never color-only. Not a
 * live region: it changes on every settled edit (the progress line's
 * reasoning). "Why?" and "Retry" are 44 px on coarse pointers, like the
 * ValidationPanel's toggle.
 */
import { GaugeIcon } from "lucide-react";

import { BRACKET_COPY } from "@/lib/brackets/copy";
import type { BracketFactsState } from "@/lib/brackets/facts";
import { bracketLineView } from "@/lib/brackets/line-view";
import type { BracketLineContext, BracketRead, GameAdapter } from "@/lib/games/types";

export function BracketLine({
  adapter,
  read,
  ctx,
  facts,
  onRetry,
  onWhy,
}: {
  adapter: GameAdapter;
  /** The read (adapter.brackets.assess); null = nothing to read yet (no commander). */
  read: BracketRead | null;
  ctx: BracketLineContext;
  facts: BracketFactsState;
  onRetry: () => void;
  onWhy: () => void;
}) {
  const brackets = adapter.brackets;
  if (!brackets || !read) return null;
  const view = bracketLineView(brackets, read, ctx, facts);
  return (
    <p
      data-slot="bracket-line"
      data-status={read.status}
      data-facts={facts}
      className="text-muted-foreground mt-1.5 flex items-baseline gap-1.5 text-xs"
    >
      {/* On the first line's baseline, whatever that line's height (a 44 px
          "Why?" on touch makes it tall); the Warden shield's size, so both
          lines' text starts at the same x. */}
      <GaugeIcon aria-hidden className="size-4 shrink-0 translate-y-[3px]" />
      <span>
        {view.text}
        {view.action && (
          <>
            {" · "}
            <button
              type="button"
              aria-haspopup={view.action === "why" ? "dialog" : undefined}
              onClick={view.action === "why" ? onWhy : onRetry}
              className="text-foreground cursor-pointer font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              {view.action === "why" ? BRACKET_COPY.why : BRACKET_COPY.retry}
            </button>
          </>
        )}
      </span>
    </p>
  );
}
