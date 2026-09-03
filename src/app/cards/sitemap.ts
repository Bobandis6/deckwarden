/**
 * Card-page sitemap (P2.6), chunked via generateSitemaps — served at
 * /cards/sitemap/[id].xml, ids enumerated by robots.ts with the same
 * CARDS_SITEMAP_CHUNK constant.
 *
 * Deliberate call (recorded per session scope): ALL ~35k non-removed card
 * identities are listed, previews included. Every card page carries data no
 * other page duplicates — printings table, current prices, legality,
 * combos — which is exactly the long-tail surface ("<card> commander")
 * that EDHREC/Scryfall index successfully at far larger scale; excluding
 * "unpopular" cards would forfeit that for no thin-content benefit, since
 * thinness is about duplicated/empty pages, not niche subjects. Preview
 * cards stay in: spoiler season is peak search interest and the page
 * labels preview status honestly.
 *
 * Caching intent: ISR, revalidate daily — the card set changes only at
 * nightly ingest. lastModified = seen_at, which the ingest advances only
 * when card content actually changed (hash-guarded upsert), making it one
 * of the few honest lastmods available anywhere.
 *
 * Chunk stability: OFFSET pagination ordered by immutable primary key —
 * rows never shift between chunks except when cards are added/removed at
 * ingest, and a daily re-read heals that.
 */
import { and, asc, count, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { getDb, schema } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { absUrl, CARDS_SITEMAP_CHUNK } from "@/lib/seo/site";

export const revalidate = 86400;

const { cardIdentities } = schema;

// MTG only, for now (P4.1): the OP corpus is live but pre-beta — no nav
// surface links OP cards, so advertising 4.8k orphan URLs to crawlers would
// be pure thin-content risk. The OP beta package widens this deliberately.
const SITEMAP_GAMES = and(
  eq(cardIdentities.gameId, GAME_ID.mtg),
  eq(cardIdentities.isRemoved, false),
);

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const [{ n }] = await getDb().select({ n: count() }).from(cardIdentities).where(SITEMAP_GAMES);
  const chunks = Math.max(1, Math.ceil(n / CARDS_SITEMAP_CHUNK));
  return Array.from({ length: chunks }, (_, id) => ({ id }));
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  // v16: the id from generateSitemaps arrives as a promise of its string form.
  const chunk = Number(await props.id);
  if (!Number.isInteger(chunk) || chunk < 0) return [];
  const rows = await getDb()
    .select({ id: cardIdentities.id, seenAt: cardIdentities.seenAt })
    .from(cardIdentities)
    .where(SITEMAP_GAMES)
    .orderBy(asc(cardIdentities.id))
    .limit(CARDS_SITEMAP_CHUNK)
    .offset(chunk * CARDS_SITEMAP_CHUNK);
  return rows.map((r) => ({
    url: absUrl(`/cards/${r.id}`),
    ...(r.seenAt ? { lastModified: r.seenAt } : {}),
  }));
}
