/**
 * Shared refetch-policy helpers for the builder's right-pane panels
 * (Suggestions P3.2, Combo Radar P3.3) — promoted out of recommend/view.ts
 * when the Radar became the second consumer. Pure so the policy stays
 * test-enforced: each panel fetches once per settled autosave burst, only
 * while its tab is visible, a leader-zone card exists, and the deck row is
 * known — and refetches only when this key changes.
 */
import type { FormatDef } from "@/lib/games/types";

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
