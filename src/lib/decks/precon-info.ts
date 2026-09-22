/**
 * Pure precon product shapes (W8b) — the fork-credit.ts pattern: the wire
 * type and label helpers the client share view renders, kept free of DB
 * imports so "use client" files can take them without dragging drizzle
 * into the bundle. The queries live in precons.ts.
 */

/** Slug grammar: public_id is `p_` + slug under `^[a-z0-9_]{4,32}$`, so a slug is 2–30 of the same alphabet. */
export const PRECON_SLUG_RE = /^[a-z0-9_]{2,30}$/;

/** The product fields the share page and the API hand to clients. */
export interface PreconInfo {
  slug: string;
  code: string;
  setCode: string;
  /** Scryfall's set name ("Commander 2016"); the code when the join misses. */
  setName: string;
  /** ISO date (yyyy-mm-dd); precons without one exist in principle (column nullable). */
  releaseDate: string | null;
  productName: string;
}

/** "Nov 2016" — UTC-pinned like every other server-rendered date. */
export function releasedLabel(releaseDate: string | Date | null): string | null {
  if (!releaseDate) return null;
  return new Date(releaseDate).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
