/**
 * Whether a target is already met by what the read's own line names
 * (BRACKET-UP's door, the owner's ask of 2026-10-27). The adapter's `bands`
 * name the levels a read's line covers, each band by its lowest level: a
 * list nothing flags reads "1 to 2" (one band, level 1), so a target of 2
 * is met there and no upgrade is offered, though 2 is above its floor of 1.
 * The target's own band comes from the same `bands`, asked of a read that
 * sits exactly at the target, so core names no level and no rule. A pending
 * call that could raise the read to the target meets it too (its band is in
 * the line); a read whose line names no level (a draft, a blocked list)
 * meets nothing here, and the caller falls back to the floor. Types only:
 * the Why sheet imports it on the share page too.
 */
import type { BracketRead, BracketsMeta } from "@/lib/games/types";

export function targetInBands(
  brackets: Pick<BracketsMeta, "bands">,
  read: BracketRead,
  target: number,
): boolean {
  const named = new Set(brackets.bands(read).map((b) => b.level));
  if (named.size === 0) return false;
  const [band] = brackets.bands({
    ...read,
    status: "read",
    minimum: target,
    suggested: null,
    review: [],
  });
  return band !== undefined && named.has(band.level);
}
