/**
 * robots.txt (P2.6).
 *
 * Caching intent: ISR, revalidate daily — the only dynamic piece is the card
 * sitemap chunk count (grows by a few thousand URLs a year), and a day-stale
 * chunk list at worst hides the newest cards from discovery for a day.
 *
 * Disallows are the non-content surfaces: APIs, the editor (/decks/*), and
 * the account page. Share pages (/d, /f) stay crawlable — private/unlisted
 * ones carry noindex metadata instead, so crawlers can fetch and then drop
 * them rather than indexing bare disallowed URLs.
 */
import { count, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { getDb, schema } from "@/db";
import { absUrl, CARDS_SITEMAP_CHUNK } from "@/lib/seo/site";

export const revalidate = 86400;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(schema.cardIdentities)
    .where(eq(schema.cardIdentities.isRemoved, false));
  const chunks = Math.max(1, Math.ceil(n / CARDS_SITEMAP_CHUNK));

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/decks/", "/account"],
    },
    sitemap: [
      absUrl("/sitemap.xml"),
      absUrl("/c/sitemap.xml"),
      ...Array.from({ length: chunks }, (_, i) => absUrl(`/cards/sitemap/${i}.xml`)),
    ],
  };
}
