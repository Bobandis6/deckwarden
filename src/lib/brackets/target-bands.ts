/**
 * Below your target's facts, by the read's own bands (BRACKET-UP's door, the
 * owner's ask of 2026-10-27). The adapter's `bands` name the levels a read's
 * line covers, each band by its lowest level, so core names no level and no
 * rule: a list nothing flags reads "1 to 2" (one band, level 1), and a
 * pending call names each outcome ("Bracket 3 or 4 · one combo is your
 * call" is in both bands). A level's own band comes from the same `bands`,
 * asked of a read that sits exactly at it. Types only: the Why sheet
 * imports it on the share page too.
 */
import type { BracketRead, BracketsMeta } from "@/lib/games/types";

type Bands = Pick<BracketsMeta, "bands">;

/** The band a read sitting exactly at `level` is in. */
function bandOf(brackets: Bands, read: BracketRead, level: number): number | undefined {
  return brackets.bands({ ...read, status: "read", minimum: level, suggested: null, review: [] })[0]
    ?.level;
}

/**
 * Whether the target is above the band the read's floor is in, so the box
 * offers the upgrade. A floor of 1 already meets a target of 2 ("1 to 2").
 * A pending call is no floor: "Bracket 3 or 4" still gets the door toward
 * 4, and the box says an answer can raise the read (integration: hiding it
 * there left 17 of the 181 dev precons below 4 with no door and no word
 * why, the way Swap to fit's door once hid itself). A read whose line names
 * no level offers nothing: a list under the format's size or a blocked one
 * already says what it needs first.
 */
export function belowTargetBand(brackets: Bands, read: BracketRead, target: number): boolean {
  if (brackets.bands(read).length === 0) return false;
  const floor = read.suggested ?? read.minimum;
  return target > floor && bandOf(brackets, read, target) !== bandOf(brackets, read, floor);
}

/** Whether the read's line names a band above its floor's: an open call that could raise it. */
export function callCanRaise(brackets: Bands, read: BracketRead): boolean {
  const floor = bandOf(brackets, read, read.suggested ?? read.minimum);
  return floor !== undefined && brackets.bands(read).some((band) => band.level > floor);
}
