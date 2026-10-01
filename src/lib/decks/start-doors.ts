/**
 * The start doors (Y2b, WAVE4 D2): the fastest ways into a deck, in ONE
 * order and ONE vocabulary for the /decks/new picker (per game) and the
 * empty draft's EmptyState — Pick a commander · Paste a list · Start from
 * a precon · Surprise me. Pure and game-agnostic: every door comes off the
 * adapter and the format, never a game check.
 *
 * - Pick a commander / leader: `display.leaderBrowse` (W4's index), where
 *   the format has a leader zone. The editor's empty leader zone already
 *   IS this door (its Browse link), so the empty draft leaves it out.
 * - Paste a list: every game — every adapter parses a decklist.
 * - Start from a precon: `display.preconBrowse` (Magic's /precons).
 * - Surprise me: where the adapter declares `recommend.autofill` (W9c's
 *   gate — the roll leads into the starter-shell flow) and the format has
 *   a leader zone to roll into.
 *
 * Doors are links or state-only seeds: none of them mints a deck row.
 */
import type { FormatDef, GameAdapter, GameId } from "@/lib/games/types";

export type StartDoor =
  | { kind: "leader"; label: string; href: string }
  | { kind: "paste"; label: string }
  | { kind: "precon"; label: string; href: string }
  | { kind: "surprise"; label: string };

export function startDoors(adapter: GameAdapter, format: FormatDef): StartDoor[] {
  const hasLeaderZone = format.zones.some((z) => z.isLeaderZone);
  const doors: StartDoor[] = [];
  const browse = adapter.display.leaderBrowse;
  if (hasLeaderZone && browse) {
    doors.push({
      kind: "leader",
      label: `Pick a ${adapter.display.leaderNoun.toLowerCase()}`,
      href: browse.href,
    });
  }
  doors.push({ kind: "paste", label: "Paste a list" });
  const precon = adapter.display.preconBrowse;
  if (precon) doors.push({ kind: "precon", label: precon.label, href: precon.href });
  if (hasLeaderZone && adapter.recommend?.autofill) {
    doors.push({ kind: "surprise", label: "Surprise me" });
  }
  return doors;
}

/**
 * Where a door goes from the picker: the index doors are their own pages;
 * Paste a list and Surprise me land on the game's draft through the
 * chooser's one-shot latches (`?import=1`, `?surprise=1`), which strip
 * themselves from the URL so a reload never re-opens or re-rolls.
 */
export function startDoorHref(door: StartDoor, game: GameId): string {
  switch (door.kind) {
    case "leader":
    case "precon":
      return door.href;
    case "paste":
      return `/decks/new?game=${game}&import=1`;
    case "surprise":
      return `/decks/new?game=${game}&surprise=1`;
  }
}
