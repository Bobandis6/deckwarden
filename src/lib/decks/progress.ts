/**
 * Progress, not problems (Y2a, WAVE4.md D2): the one owner of the words an
 * unfinished deck gets — "Choose a commander · 100 to go" in the editor's
 * validation slot, "98 / 100 · 2 to go" beside the completion ring, and
 * (Y4a) the bracket line's draft state. Game-ignorant: the leader noun comes
 * off the adapter, the minimums off the FormatDef.
 *
 * The adapters' `progress` flag (types.ts) marks WHICH issues are progress;
 * this module says how far there is to go. Both read the same minimums, so a
 * flagged issue always has a line. Over the maximum is never progress — it
 * stays a problem (and the Cut Coach's "Over by N").
 */
import { deckSizeCount, zoneQty, type EditorEntry } from "@/lib/decks/editor-state";
import type { FormatDef, ValidationIssue } from "@/lib/games/types";

export interface DeckProgress {
  /** A leader zone sits under its minimum (an empty command zone / no Leader). */
  needsLeader: boolean;
  /** Cards short of the format's minimum deck size; 0 at or over it. */
  toGo: number;
}

export function isProgressIssue(issue: ValidationIssue): boolean {
  return issue.progress === true;
}

export function deckProgress(entries: readonly EditorEntry[], format: FormatDef): DeckProgress {
  const leaderZone = format.zones.find((z) => z.isLeaderZone);
  return {
    needsLeader: leaderZone !== undefined && zoneQty(entries, leaderZone.id) < leaderZone.min,
    toGo: Math.max(0, format.deckSize.min - deckSizeCount(entries, format)),
  };
}

/** "N to go" while under the minimum; null at or over it (over is a problem, not progress). */
export function toGoPhrase(toGo: number): string | null {
  return toGo > 0 ? `${toGo} to go` : null;
}

/**
 * The bracket line's draft phrase (Y4a, WAVE4 D5): "add 34 more cards" —
 * the adapter's line wraps it ("Bracket: add 34 more cards · 1 Game Changer
 * so far"). Null at or over the minimum, like toGoPhrase.
 */
export function addMorePhrase(toGo: number): string | null {
  return toGo > 0 ? `add ${toGo} more ${toGo === 1 ? "card" : "cards"}` : null;
}

/**
 * The share page's draft phrase (Y5): "34 cards to go" — the same count
 * said to the pod rather than to the builder ("add 34 more cards").
 */
export function cardsToGoPhrase(toGo: number): string | null {
  return toGo > 0 ? `${toGo} ${toGo === 1 ? "card" : "cards"} to go` : null;
}

/**
 * "Choose a commander · 100 to go" / "Choose a leader · 50 to go" /
 * "2 to go"; null once neither applies. `leaderNoun` is the adapter's
 * display noun ("Commander", "Leader").
 */
export function progressLine(progress: DeckProgress, leaderNoun: string): string | null {
  const parts = [
    progress.needsLeader ? `Choose a ${leaderNoun.toLowerCase()}` : null,
    toGoPhrase(progress.toGo),
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}
