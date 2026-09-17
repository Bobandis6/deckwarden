/**
 * Meta Lens hub table (P3.10, LATER row 34): the pure half — types, the
 * disclosed floor/cap, and the share/date wording the section claims.
 * Ranking is raw share (lists desc), measured 2026-09-17 against the live
 * aggregate: a global-lift "tech" ordering saturates at total/commander
 * lists for every card played only with that commander, so its top is
 * one-list singletons — noise, not tech. The subtitle therefore says
 * "most played", and `top4` is a DISCLOSED column that never affects order
 * (LATER row 38's fence).
 */

export interface MetaLensRow {
  id: string;
  name: string;
  /** Settled top-16 lists (union across this leader's commander sets) playing the card. */
  lists: number;
  /** Of those, lists that placed top 4 — displayed, never ranked on. */
  top4: number;
}

export interface MetaLens {
  rows: MetaLensRow[];
  /** The denominator: union of commander_stats.lists across sets containing the leader. */
  totalLists: number;
  /** Commander sets merged (1 = the exact solo set; >1 = partner pairings included). */
  setCount: number;
  /** min(first_seen) across those sets, ISO date. */
  since: string;
}

export const META_LENS_LIMIT = 25;

/**
 * Below 5 union lists shares are noise (the P3.8 low-confidence band) — the
 * loader returns null and the section renders honest absence.
 */
export const META_LENS_MIN_LISTS = 5;

/**
 * "62% · 58 of 94" — the literal n-of-N always rides the percent. Honesty
 * edges: 100% only when the card is in EVERY list (99.66% must not round up
 * to a claim of all), and a real share never displays as 0%.
 */
export function shareLabel(lists: number, total: number): string {
  const nOfN = `${lists} of ${total}`;
  if (lists === total) return `100% · ${nOfN}`;
  const pct = Math.min(99, Math.round((lists / total) * 100));
  return pct === 0 ? `<1% · ${nOfN}` : `${pct}% · ${nOfN}`;
}

/** "2026-03-06" → "Mar 6, 2026", pinned to UTC so the date never shifts a day. */
export function sinceLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
