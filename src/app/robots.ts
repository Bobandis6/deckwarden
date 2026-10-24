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
 *
 * AI training crawlers (2026-10-18, the owner's call): Reflectionbot,
 * ClaudeBot and GPTBot get a group of their own with `Disallow: /`. A crawler
 * follows only the group that names its token and then ignores `*` (RFC 9309),
 * so these three read nothing, while Googlebot, Bingbot and OpenAI's
 * OAI-SearchBot (search crawlers, which send visitors) keep the `*` rules.
 * The trigger: one crawler's sweep of the sitemap on 2026-10-11 cost ~210K ISR
 * write units, more than Hobby's 200K per 30 days, and training crawlers send
 * no visitors back. All three say they honor robots.txt; Reflection AI says
 * its crawler picks a change up within about a day.
 */
import { and, count, eq, inArray } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { getDb, schema } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { notTokenSql } from "@/lib/cards/tokens-sql";
import { absUrl, CARDS_SITEMAP_CHUNK } from "@/lib/seo/site";

export const revalidate = 86400;

// Exact product tokens, matched case-insensitively by the crawlers: the
// vendors' search and user-triggered agents (OAI-SearchBot, ChatGPT-User,
// Claude-SearchBot, Claude-User) are different tokens and keep the `*` rules.
const AI_TRAINING_CRAWLERS = ["Reflectionbot", "ClaudeBot", "GPTBot"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(schema.cardIdentities)
    // Must mirror cards/sitemap.ts's scope (MTG + OP since P4.4, tokens out
    // since DECK-TOKENS) or the chunk count here drifts from the chunks that
    // actually exist.
    .where(
      and(
        inArray(schema.cardIdentities.gameId, [GAME_ID.mtg, GAME_ID.optcg]),
        eq(schema.cardIdentities.isRemoved, false),
        notTokenSql(schema.cardIdentities.attrs),
      ),
    );
  const chunks = Math.max(1, Math.ceil(n / CARDS_SITEMAP_CHUNK));

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/decks/", "/account"],
      },
      { userAgent: AI_TRAINING_CRAWLERS, disallow: "/" },
    ],
    sitemap: [
      absUrl("/sitemap.xml"),
      absUrl("/c/sitemap.xml"),
      absUrl("/l/sitemap.xml"),
      ...Array.from({ length: chunks }, (_, i) => absUrl(`/cards/sitemap/${i}.xml`)),
    ],
  };
}
