/**
 * Canonical site origin, shared by metadataBase, canonicals, sitemaps, and
 * robots (P2.6). One resolver so every absolute URL the crawlers see agrees.
 *
 * Order: explicit NEXT_PUBLIC_SITE_URL wins; Vercel *production* pins to the
 * real domain (VERCEL_URL there is the deployment's *.vercel.app hostname —
 * canonicalizing to it would split indexing across two hosts); previews
 * self-reference so their OG unfurls resolve; everything else (local dev,
 * VPS) defaults to the real domain.
 */
const PRODUCTION_ORIGIN = "https://deckwarden.gg";

export function siteOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return PRODUCTION_ORIGIN;
}

/** Absolute URL for a site path — sitemap entries must be fully qualified. */
export function absUrl(path: string): string {
  return new URL(path, siteOrigin()).toString();
}

/**
 * Cards-per-file for the chunked card sitemap (app/cards/sitemap.ts). Lives
 * here so robots.ts can list the same chunk URLs the sitemap route serves.
 * 10k keeps each response ~1MB and 4 files at today's ~35k cards; the
 * protocol limit is 50k URLs per file.
 */
export const CARDS_SITEMAP_CHUNK = 10_000;
