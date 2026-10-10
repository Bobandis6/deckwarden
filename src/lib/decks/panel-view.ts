/**
 * Shared refetch-policy helpers for the builder's right-pane panels
 * (Suggestions P3.2, Combo Radar P3.3) — promoted out of recommend/view.ts
 * when the Radar became the second consumer. Pure so the policy stays
 * test-enforced: each panel fetches once per settled autosave burst, only
 * while its tab is visible, a leader-zone card exists, and the deck row is
 * known — and refetches only when this key changes. Y2b: Suggestions also
 * answers a draft (no row) through POST /api/recommendations, whose body
 * snapshotBody builds from the same facts the key reads.
 */
import type { DeckGoals } from "@/lib/decks/goals";
import type { FormatDef, GameId } from "@/lib/games/types";

/** The entry fields the deck-derived server computations actually depend on. */
export interface DeckKeyEntry {
  cardId: string;
  zone: string;
  qty: number;
}

/**
 * The panels' refetch key — the server side reads the deck's (card, zone,
 * qty) rows plus the leader-derived ci_mask, all functions of exactly these
 * three fields. Tags, printings, and deck meta are omitted by design:
 * editing them must never refetch. Sorted so entry order (which the editor
 * preserves but the server computations ignore) can't cause spurious
 * refetches.
 */
export function deckStateKey(entries: readonly DeckKeyEntry[]): string {
  return entries
    .map((e) => `${e.cardId}:${e.zone}:${e.qty}`)
    .sort()
    .join("|");
}

/** Whether the deck has a leader-zone card — the panels' fetch gate. */
export function hasLeader(entries: readonly { zone: string }[], format: FormatDef): boolean {
  const leaderZones = new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id));
  return entries.some((e) => leaderZones.has(e.zone));
}

/** POST /api/recommendations' body (Y2b) — a draft's snapshot, ids and copies only. */
export interface SnapshotBody {
  game: GameId;
  format: string;
  leaderIds: string[];
  entries: { cardId: string; qty: number }[];
  budget?: number;
  /** Y6a: the draft's goals the check reads (goals.ts' suggestionGoals); absent = none. */
  goals?: DeckGoals;
}

/**
 * The Suggestions panel's draft request (Y2b): what a deck row would hold —
 * the leader-zone ids in entry order (the decks row's `leader_ids` order)
 * and every other entry with its copies (the ranker's curve counts them) —
 * built from the same (card, zone, qty) facts deckStateKey keys on, so an
 * unchanged draft never asks twice. `budgetUsd` is the GET's `budget`;
 * absent = no budget. `goals` (Y6a) rides along when there are any.
 */
export function snapshotBody(
  game: GameId,
  format: FormatDef,
  entries: readonly DeckKeyEntry[],
  budgetUsd?: number,
  goals?: DeckGoals | null,
): SnapshotBody {
  const leaderZones = new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id));
  return {
    game,
    format: format.code,
    leaderIds: entries.filter((e) => leaderZones.has(e.zone)).map((e) => e.cardId),
    entries: entries
      .filter((e) => !leaderZones.has(e.zone))
      .map((e) => ({ cardId: e.cardId, qty: e.qty })),
    ...(budgetUsd !== undefined ? { budget: budgetUsd } : {}),
    ...(goals ? { goals } : {}),
  };
}
