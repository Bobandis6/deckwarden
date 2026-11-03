/**
 * The day's search examples, read on the server (SEARCH-EXAMPLES): /cards
 * renders them under its filters and GET /api/cards/examples hands them to
 * the header's box.
 *
 * Caching intent: Next's data cache (`unstable_cache`), keyed by the day,
 * revalidated hourly. This is the repo's first use of it, and the reason is
 * the statement count: /cards renders per request and never touched the
 * database (its grid asks the CDN-cached search route), so the rows the
 * day's commanders come from (home's top-30 statement) are read at most
 * once an hour by each reader, never once per page view. Each reader, not
 * both together: Next keys an entry by the callback's compiled text, and
 * the route's bundle and the page's compile this file apart, so each keeps
 * its own entry (measured on a local production build with DB_LOG: a cold
 * /cards ran one statement and wrote one entry, the requests after it
 * none). The day comes from the caller, never a clock read in here, so a
 * new UTC day is a new key and the examples turn over with home's hero.
 *
 * Fail open: a failed read logs and answers the examples without the day's
 * commanders (Sol Ring and the One Piece number), so /cards never fails
 * over a line of links.
 */
import { unstable_cache } from "next/cache";

import { POOL_SIZE } from "@/lib/home/shelves";
import { loadTopCommanders } from "@/lib/hub/queries";
import { searchExamples, type SearchExample } from "@/lib/search/examples";

/** The cache's lifetime in seconds: the rows' freshness, an hour behind home at most. */
export const EXAMPLES_REVALIDATE_SECONDS = 3600;

const cachedExamples = unstable_cache(
  async (day: string): Promise<SearchExample[]> =>
    searchExamples(day, await loadTopCommanders(POOL_SIZE)),
  ["search-examples"],
  { revalidate: EXAMPLES_REVALIDATE_SECONDS },
);

export async function loadSearchExamples(day: string): Promise<SearchExample[]> {
  try {
    return await cachedExamples(day);
  } catch (err) {
    console.error("[search-examples] the day's commanders failed, examples without them", err);
    return searchExamples(day, []);
  }
}
