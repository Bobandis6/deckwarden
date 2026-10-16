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
 *
 * Y7b: the line takes focus programmatically (`tabIndex={-1}`, never in the
 * tab order) — where a swap made from the Why sheet's callout hands focus
 * back while the facts for the new list are still being checked and "Why?"
 * isn't there yet; one Tab reaches it once it is.
 *
 * U3a (WAVE5 D4, the status slot): the line holds its place from first
 * paint: with no read yet (no commander) it is present and empty, never an
 * invented sentence, so the read's arrival moves nothing. Its lead (the
 * bracket number) reads foreground medium and the rest muted, and "Why?" /
 * "Retry" are muted text buttons that come forward on hover and focus:
 * 44 px on touch without growing the line, since their margins give back
 * what reaches past it. The editor's form since U3a and the share page's
 * since U6 (WAVE5 D7), so it is the only form: the `slot` switch is gone.
 */
import { GaugeIcon } from "lucide-react";

import { BRACKET_COPY } from "@/lib/brackets/copy";
import type { BracketFactsState } from "@/lib/brackets/facts";
import { bracketLineLead, bracketLineView } from "@/lib/brackets/line-view";
import type { BracketLineContext, BracketRead, GameAdapter } from "@/lib/games/types";
import { cn } from "@/lib/utils";

const LINE_CLASS =
  "type-meta-multiline text-muted-foreground focus-visible:ring-ring/50 mt-1.5 flex items-baseline gap-1.5 rounded-sm outline-none focus-visible:ring-2";
/** On the first line's baseline; the Warden shield's size, so both lines' text starts at the same x. */
const ICON_CLASS = "size-4 shrink-0 translate-y-[3px]";
/**
 * The status slot's action (U3a): muted, forward on hover and focus. On
 * touch the box is 44 px and its margins give back the 26 px past the
 * 18 px line, so the target grows and the line doesn't.
 */
const ACTION_CLASS =
  "text-muted-foreground hover:text-foreground focus-visible:text-foreground cursor-pointer font-medium transition-colors pointer-coarse:-my-[13px] pointer-coarse:min-h-11 pointer-coarse:min-w-11";

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
  if (!brackets) return null;
  if (!read) {
    // The line's own box, empty: the hidden glyph and one blank line give it
    // a read's height and baseline, so the read lands without moving anything.
    return (
      <p
        data-slot="bracket-line"
        data-status="empty"
        data-facts={facts}
        aria-hidden
        className={LINE_CLASS}
      >
        <GaugeIcon aria-hidden className={cn(ICON_CLASS, "invisible")} />
        <span>{" "}</span>
      </p>
    );
  }
  const view = bracketLineView(brackets, read, ctx, facts);
  const lead = bracketLineLead(view);
  return (
    <p
      data-slot="bracket-line"
      data-status={read.status}
      data-facts={facts}
      tabIndex={-1}
      className={LINE_CLASS}
    >
      <GaugeIcon aria-hidden className={ICON_CLASS} />
      <span>
        {lead ? (
          <>
            <span className="text-foreground font-medium">{lead}</span>
            {view.text.slice(lead.length)}
          </>
        ) : (
          view.text
        )}
        {view.action && (
          <>
            {" · "}
            <button
              type="button"
              aria-haspopup={view.action === "why" ? "dialog" : undefined}
              onClick={view.action === "why" ? onWhy : onRetry}
              className={ACTION_CLASS}
            >
              {view.action === "why" ? BRACKET_COPY.why : BRACKET_COPY.retry}
            </button>
          </>
        )}
      </span>
    </p>
  );
}
