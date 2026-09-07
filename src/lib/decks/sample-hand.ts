/**
 * Pure sample-hand mechanics (P2.7). No IO, no component state — both the
 * share page and the editor render the same widget over these.
 *
 * The library is every non-leader-zone entry expanded to qty copies (the
 * commander starts in the command zone, not your deck — splitLeaderEntries is
 * already the one place that knows which zones those are). Hand size comes
 * off the format (Commander 7, OP 5 — P4.6). Mulligan is plan-literal:
 * shuffle everything back, redraw the full hand — which happens to BE the
 * One Piece mulligan; London bottoming belongs to the future goldfish
 * playtester (LATER.md), not this widget.
 */
import { splitLeaderEntries } from "@/lib/decks/view-model";
import type { FormatDef } from "@/lib/games/types";

/** Card ids of the shuffleable library: non-leader zones, expanded by qty. */
export function buildLibrary(
  entries: readonly { cardId: string; zone: string; qty: number }[],
  format: FormatDef,
): string[] {
  const { rest } = splitLeaderEntries(entries, format);
  return rest.flatMap((e) => Array<string>(e.qty).fill(e.cardId));
}

/** Honest Fisher–Yates over a copy; rng injectable so tests are deterministic. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A fresh opening hand (or the whole library when it's smaller). */
export function drawHand(
  library: readonly string[],
  handSize: number,
  rng?: () => number,
): string[] {
  return shuffle(library, rng).slice(0, handSize);
}
