/**
 * Which line the deck pane shows (Y4a, WAVE4 D5) — pure, so the order is
 * pinned in one place. The adapter words the read (`brackets.line`); this
 * decides when core's own lines take its place and what follows the text:
 *
 * 1. blocked — the adapter's "needs a legal list" line, with nothing after
 *    it (the problem list above already names the card);
 * 2. the facts failed — "Couldn't check combos · Retry";
 * 3. a draft — the adapter's draft line at once (what the card data proves
 *    needs no facts; a combo joins when they land), with "Why?" once the
 *    facts are in and the list has found something to explain — or the
 *    deck holds goals (Y4b): its target and answers live in the sheet, so
 *    a list cut back under the minimum never hides them;
 * 4. the facts are on their way — "Checking combos…" (a read that may be
 *    out of date says so, D11);
 * 5. otherwise the adapter's line and "Why?".
 *
 * Y4b: answers given under older rules add "Rules changed since you
 * answered" before "Why?" — a rules change prompts a review (D11), and the
 * sheet is where it happens. Y5: never in the table's voice (the share
 * page) — the prompt is the owner's, and the editor is where it's answered.
 */
import { BRACKET_COPY } from "@/lib/brackets/copy";
import type { BracketFactsState } from "@/lib/brackets/facts";
import type { BracketLineContext, BracketRead, BracketsMeta } from "@/lib/games/types";

export interface BracketLineView {
  text: string;
  /** What follows the text: the Why sheet, a fresh ask, or nothing. */
  action: "why" | "retry" | null;
}

/** Something a draft's sheet could show: a finding, a question, or the deck's goals. */
function foundAnything(read: BracketRead, ctx: BracketLineContext): boolean {
  return (
    read.factors.some((f) => f.atLeast !== null) ||
    read.review.length > 0 ||
    (ctx.targetLevel ?? null) !== null ||
    read.suggested !== null ||
    read.answersStale
  );
}

/** Answers from older rules: the line asks for a second look before "Why?". */
function withStale(
  read: BracketRead,
  ctx: BracketLineContext,
  view: BracketLineView,
): BracketLineView {
  return read.answersStale && ctx.voice !== "table" && view.action === "why"
    ? { ...view, text: `${view.text} · ${BRACKET_COPY.rulesChanged}` }
    : view;
}

export function bracketLineView(
  brackets: Pick<BracketsMeta, "line">,
  read: BracketRead,
  ctx: BracketLineContext,
  facts: BracketFactsState,
): BracketLineView {
  if (read.status === "blocked") return { text: brackets.line(read, ctx), action: null };
  if (facts === "failed") return { text: BRACKET_COPY.failed, action: "retry" };
  if (read.status === "draft") {
    return withStale(read, ctx, {
      text: brackets.line(read, ctx),
      action: facts !== "checking" && foundAnything(read, ctx) ? "why" : null,
    });
  }
  if (facts === "checking") return { text: BRACKET_COPY.checking, action: null };
  return withStale(read, ctx, { text: brackets.line(read, ctx), action: "why" });
}
