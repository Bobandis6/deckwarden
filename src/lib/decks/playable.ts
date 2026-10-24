/**
 * The playable list (DECK-TOKENS): the entries in the leader zone(s) and the
 * zones whose cards count toward the deck's size — Magic's commander + main,
 * One Piece's leader + main (One Piece's Leader counts toward no size, yet
 * it is played: "playable" is leader OR counted, never `countsTowardSize`
 * alone, which is the SIZE question and stays deckSizeCount's). A zone that
 * is neither (Magic's Tokens, `ZoneDef.holds: "tokens"`) rides along
 * wherever the deck is CARRIED — the wire, both views, versions, restore,
 * forks — and is read by nothing that reasons about the deck as PLAYED:
 * validation, analytics, the bracket read, suggestions, Autofill, Swap Lab,
 * the Cut Coach, the export, the list hash, OG images.
 *
 * Game-ignorant like editor-state.ts: zone knowledge comes off the FormatDef.
 * A zone the format doesn't define counts as playable, so the adapter's
 * ZONE_UNKNOWN still sees it.
 */
import type { FormatDef, ZoneDef } from "@/lib/games/types";

function playable(zone: ZoneDef): boolean {
  return zone.countsTowardSize || zone.isLeaderZone === true;
}

/** Whether a zone's cards belong to the playable list (an undefined zone does, for ZONE_UNKNOWN). */
export function isPlayableZone(format: FormatDef, zoneId: string): boolean {
  const zone = format.zones.find((z) => z.id === zoneId);
  return zone ? playable(zone) : true;
}

/** The ids of the format's playable zones, in format order — for SQL over deck_cards and frozen lists. */
export function playableZoneIds(format: FormatDef): string[] {
  return format.zones.filter(playable).map((z) => z.id);
}

/** The entries of the playable list, in their order. */
export function playableEntries<E extends { zone: string }>(
  entries: readonly E[],
  format: FormatDef,
): E[] {
  return entries.filter((e) => isPlayableZone(format, e.zone));
}

/** The format's token zone, if it has one (Magic's Tokens). */
export function tokenZoneOf(format: FormatDef): ZoneDef | undefined {
  return format.zones.find((z) => z.holds === "tokens");
}
