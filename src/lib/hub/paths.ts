/**
 * The public pages that embed deck rows from the ISR cache, and the one call
 * that refreshes them when a deck is withdrawn (the 2026-10-30 security
 * audit's hub record). /c/[slug]'s "Decks with this commander" shelf and the
 * core sitemap (src/app/sitemap.ts) are rendered once and served for an hour
 * — and, past the hour, still to the first request that arrives, however late,
 * while a background render runs (Next's stale-while-revalidate; the entry
 * stays servable until the route's `expire`, a year by default). Their
 * `visibility = 'public'` predicate is bound at render time, so a deck set
 * private, unlisted or deleted kept its name, byline, likes, bracket and share
 * link on a public, indexable page for the rest of that window while its own
 * share page answered 404 at once — against the privacy page's "deletion is
 * immediate on the live site".
 *
 * `revalidatePath` expires the tag every runtime render of a path stores with
 * its entry, so the NEXT request gets a blocking fresh render instead of the
 * stale copy (on Vercel the platform's ISR cache; on the standalone server
 * Next's own file-system cache). Called from the route handlers that move a
 * deck into or out of `public`, delete a public deck, or delete an account
 * (whose /u/ profile is a sitemap entry too). Magic hubs alone carry a shelf:
 * One Piece's /l/ pages render none, so a One Piece deck refreshes the
 * sitemap only. Never throws: a failed refresh is logged and the write that
 * already happened still answers — the hour-long window is the old behaviour,
 * not a new failure. The nightly guest purge runs outside the server and
 * cannot call this (LATER.md fences it).
 */
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb, schema } from "@/db";
import { GAME_ID } from "@/db/seed-data";

/** What a listing needs of a deck row: its game and its command zone. */
export interface DeckListingRef {
  gameId: number;
  leaderIds: readonly string[];
}

/**
 * Refresh every listing the given decks sat on: each Magic commander's hub
 * and the core sitemap. Returns the paths marked, for the callers' tests.
 */
export async function revalidateDeckListings(decks: readonly DeckListingRef[]): Promise<string[]> {
  const paths = new Set<string>(["/sitemap.xml"]);
  try {
    const leaderIds = [
      ...new Set(decks.filter((d) => d.gameId === GAME_ID.mtg).flatMap((d) => d.leaderIds)),
    ];
    if (leaderIds.length > 0) {
      const leaders = await getDb()
        .select({ slug: schema.cardIdentities.slug })
        .from(schema.cardIdentities)
        .where(inArray(schema.cardIdentities.id, leaderIds));
      for (const { slug } of leaders) if (slug) paths.add(`/c/${slug}`);
    }
    for (const path of paths) revalidatePath(path);
  } catch (err) {
    console.error("deck listings not revalidated (the hour-long ISR window applies):", err);
  }
  return [...paths];
}
