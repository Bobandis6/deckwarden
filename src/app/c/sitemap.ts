/**
 * Commander-hub sitemap (P2.6): every leader with a hub slug — ~4k URLs,
 * comfortably one file (protocol limit 50k). All hubs are substantive by
 * construction: staples, curve, budget tiers, and combos exist for any
 * color identity, so there's no thin subset to exclude.
 *
 * Caching intent: ISR, revalidate daily — hub slugs only change at nightly
 * ingest. lastModified is omitted deliberately: hub content (staples order,
 * prices, combos) shifts nightly regardless of the leader row's own
 * timestamps, and a lastmod that understates change is worse than none.
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
        // Game-scoped (P4.1): only MTG leaders get slugs today, but a missing
        // filter here would advertise /c/ URLs that don't resolve the moment
        // any other game's leaders are slugged.
        eq(cardIdentities.gameId, GAME_ID.mtg),
        eq(cardIdentities.isLeaderCandidate, true),
        isNotNull(cardIdentities.slug),
        eq(cardIdentities.isRemoved, false),
      ),
    );
  return leaders.map((l) => ({ url: absUrl(`/c/${l.slug}`) }));
}
