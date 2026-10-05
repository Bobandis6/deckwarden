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
 *    facts are in and the list has found something to explain;
 * 4. the facts are on their way — "Checking combos…" (a read that may be
 *    out of date says so, D11);
 * 5. otherwise the adapter's line and "Why?".
 */
import { BRACKET_COPY } from "@/lib/brackets/copy";
import type { BracketFactsState } from "@/lib/brackets/facts";
import type { BracketLineContext, BracketRead, BracketsMeta } from "@/lib/games/types";

export interface BracketLineView {
  text: string;
  /** What follows the text: the Why sheet, a fresh ask, or nothing. */
  action: "why" | "retry" | null;
}

/** Something a draft's sheet could show: a finding, or a question. */
function foundAnything(read: BracketRead): boolean {
  return read.factors.some((f) => f.atLeast !== null) || read.review.length > 0;
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
    return {
      text: brackets.line(read, ctx),
      action: facts !== "checking" && foundAnything(read) ? "why" : null,
    };
  }
  if (facts === "checking") return { text: BRACKET_COPY.checking, action: null };
  return { text: brackets.line(read, ctx), action: "why" };
}
