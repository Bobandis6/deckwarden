/**
 * OP leader-hub sitemap (P4.4): every OP leader with a hub slug — 142 URLs,
 * one file.
 *
 * Thin-content call, made deliberately (the cold-start hubs are card-data
 * only): these pages ARE advertised to crawlers because (a) each is
 * genuinely distinct — own art, colors, life, effect text, traits — the 17
 * Monkey.D.Luffys differ on all of those; (b) the hub carries content the
 * card page doesn't (namesake cross-links, color/trait browse links,
 * deck-building framing) and vice versa (printings/legality), so neither
 * duplicates the other; (c) 142 URLs is no crawl-budget risk when the card
 * sitemap already lists all 4,843 OP card pages with LESS framing per page;
 * (d) "<leader> deck" queries are exactly this long tail. Revisit only if
 * Search Console ever flags them — the escape hatch is noindex, not URL
 * removal.
 *
 * Caching intent: ISR, revalidate daily — slugs change only at nightly
 * ingest. lastModified omitted, same reasoning as c/sitemap.ts.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { getDb, schema } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { absUrl } from "@/lib/seo/site";

export const revalidate = 86400;

const { cardIdentities } = schema;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const leaders = await getDb()
    .select({ slug: cardIdentities.slug })
    .from(cardIdentities)
    .where(
      and(
        eq(cardIdentities.gameId, GAME_ID.optcg),
        eq(cardIdentities.isLeaderCandidate, true),
        isNotNull(cardIdentities.slug),
        eq(cardIdentities.isRemoved, false),
      ),
    );
  return leaders.map((l) => ({ url: absUrl(`/l/${l.slug}`) }));
}
