/**
 * Pure helpers behind the ambient-art layer (R2, REDESIGN.md §3): which
 * leader's art a deck shows, the request key the stale guard compares, the
 * endpoint path, and the leader ordering that keeps the choice stable.
 *
 * The art leader is the FIRST leader-zone entry in entries order — partner
 * decks keep insertion order, and no separate leader-order field exists
 * (§3). `leaderDenorm` writes `decks.leader_ids` from the same order on
 * every save, so the share page, the OG unfurl and the builder agree. One
 * wrinkle: the deck wire sorts entries by name within a zone, so a reloaded
 * builder would flip the art leader of a partner deck saved in the other
 * order — hydration and the share view run `orderLeadersBy` over the wire
 * with the deck's `leaderIds` first, so the choice survives reloads,
 * imports and restores as the contract asks.
 *
 * No IO, importable from client and server alike (tiles.ts and the
 * ambient layer both take `ambientGradient` from here).
 */
import { splitLeaderEntries } from "@/lib/decks/view-model";
import type { FormatDef } from "@/lib/games/types";

/** Where each swatch pools; one color fills the middle, more spread around it. */
const SPOTS = ["18% 22%", "82% 30%", "50% 80%", "20% 78%", "82% 82%", "50% 42%"];

/**
 * The color-identity gradient (R2, G7) — the ambient layer's fallback paint
 * and, since R5a, the deck tiles' and leader shelves' image-slot paint for
 * games whose images are gated (LATER row 51). Pure CSS string.
 */
export function ambientGradient(swatches: readonly string[]): string {
  if (swatches.length === 1) {
    return `radial-gradient(ellipse 90% 80% at 50% 40%, ${swatches[0]} 0%, transparent 70%)`;
  }
  return swatches
    .map(
      (color, i) =>
        `radial-gradient(ellipse 60% 55% at ${SPOTS[i % SPOTS.length]}, ${color} 0%, transparent 70%)`,
    )
    .join(", ");
}

export interface LeaderArtTarget {
  cardId: string;
  /** The entry's chosen alt printing; null = the identity's default printing. */
  printingId: string | null;
}

/** The art leader — null without a leader-zone entry. Never reads the preview card. */
export function leaderArtTarget<
  E extends { zone: string; cardId: string; printingId?: string | null },
>(entries: readonly E[], format: FormatDef): LeaderArtTarget | null {
  const first = splitLeaderEntries(entries, format).leader[0];
  return first ? { cardId: first.cardId, printingId: first.printingId ?? null } : null;
}

/** One key per (card, printing): the unit the builder fetches by and the stale guard compares. */
export function artTargetKey(target: LeaderArtTarget): string {
  return `${target.cardId}:${target.printingId ?? ""}`;
}

/** GET /api/cards/[id]/art, with the chosen printing when the entry has one. */
export function artRequestPath(target: LeaderArtTarget): string {
  const query = target.printingId ? `?printingId=${encodeURIComponent(target.printingId)}` : "";
  return `/api/cards/${target.cardId}/art${query}`;
}

/**
 * Leader-zone entries in `leaderIds` order (the decks-row denorm, i.e. the
 * order of the last save) ahead of the rest in their given order — ids the
 * denorm does not know keep their relative order after the known ones.
 */
export function orderLeadersBy<E extends { zone: string; cardId: string }>(
  entries: readonly E[],
  format: FormatDef,
  leaderIds: readonly string[],
): E[] {
  const { leader, rest } = splitLeaderEntries(entries, format);
  if (leader.length < 2) return [...leader, ...rest];
  const rank = new Map(leaderIds.map((id, i) => [id, i] as const));
  const unknown = leaderIds.length;
  const ordered = [...leader].sort(
    (a, b) => (rank.get(a.cardId) ?? unknown) - (rank.get(b.cardId) ?? unknown),
  );
  return [...ordered, ...rest];
}
