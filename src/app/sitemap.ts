/**
 * Core sitemap (P2.6): static pages + every *public* deck, folder, and
 * profile. Hubs and cards are big enough to get their own files
 * (app/c/sitemap.ts, app/cards/sitemap.ts); robots.ts lists all of them.
 *
 * Caching intent: ISR, revalidate hourly — new public decks should be
 * discoverable the same day, and the three queries are cheap and indexed.
 *
 * Visibility contract: PUBLIC rows only. Unlisted decks/folders are
 * reachable-by-link by design (Appendix A) — listing them here would turn
 * "unguessable URL" into "published URL", so they're excluded and their
 * pages carry noindex. Private rows never leave the DB. Profiles appear
 * only when they have at least one public deck: choosing a username is the
 * publish opt-in, but an empty profile page is thin crawl noise.
 */
import { and, eq, exists, isNotNull } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { getDb, schema } from "@/db";
import { absUrl } from "@/lib/seo/site";

export const revalidate = 3600;

const { decks, deckFolders, users } = schema;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();
  const [publicDecks, publicFolders, profiles] = await Promise.all([
    db
      .select({ publicId: decks.publicId, updatedAt: decks.updatedAt })
      .from(decks)
      .where(eq(decks.visibility, "public")),
    db
      .select({ publicId: deckFolders.publicId, updatedAt: deckFolders.updatedAt })
      .from(deckFolders)
      .where(eq(deckFolders.visibility, "public")),
    db
      .select({ username: users.username })
      .from(users)
      .where(
        and(
          isNotNull(users.username),
          exists(
            db
              .select({ one: decks.id })
              .from(decks)
              .where(and(eq(decks.userId, users.id), eq(decks.visibility, "public"))),
          ),
        ),
      ),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absUrl("/") },
    { url: absUrl("/commanders") },
    { url: absUrl("/cards") },
    { url: absUrl("/legal") },
    { url: absUrl("/privacy") },
  ];

  return [
    ...staticPages,
    ...publicDecks.map((d) => ({ url: absUrl(`/d/${d.publicId}`), lastModified: d.updatedAt })),
    ...publicFolders.map((f) => ({ url: absUrl(`/f/${f.publicId}`), lastModified: f.updatedAt })),
    ...profiles.map((p) => ({ url: absUrl(`/u/${p.username}`) })),
  ];
}
