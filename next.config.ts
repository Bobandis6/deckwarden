import type { NextConfig } from "next";

/**
 * The card pages' CDN cache (2026-10-18, the ISR write budget). /cards/[id]
 * renders on demand now, and Vercel's CDN keeps each page: fresh for an
 * hour, then served stale for up to a day while the next request
 * re-renders it — the freshness the hourly ISR route had. A dynamic page
 * leaves Next with `Cache-Control: private, no-cache, no-store`, which
 * browsers keep; the targeted `CDN-Cache-Control` (RFC 9213) is what a CDN
 * reads instead, and on Vercel it always overrides `Cache-Control`, even
 * when set from this file (vercel.com/docs/caching/cache-control-headers). CDN cache
 * writes are free where every ISR render of a card page spent ~5 of
 * Hobby's 200K monthly write units, and one crawler sweep of the 38,192
 * card URLs cost ~195K (2026-10-11). Off Vercel, the same header serves any
 * CDN that reads it (LATER.md row 279 has the VPS note).
 */
const CARD_PAGE_CDN_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

const nextConfig: NextConfig = {
  // Portability rule: build must run on any Node host (Hetzner runbook), not just Vercel.
  // Vercel's build packaging breaks on standalone output (ENOENT next-server.js.nft.json),
  // and it doesn't need it — so standalone applies everywhere except Vercel itself.
  output: process.env.VERCEL ? undefined : "standalone",
  // S0 (SECURITY-AUDIT-report.md L20): the app renders every image with a
  // plain <img> (CLAUDE.md: hotlink Scryfall's CDN, no next/image
  // optimization), so the optimizer endpoint /_next/image was reachable but
  // unused — attack surface for the optimizer advisories (H1, GHSA-2464 on
  // the standalone build) and a free way to spend Hobby's optimization quota.
  // Caching intent: none changes — the static assets keep their immutable
  // headers and no route is added; `unoptimized` only stops the optimizer
  // from being wired, and the images' own hosts keep serving them as before.
  images: { unoptimized: true },
  env: {
    // W7: pin a BUILD-TIME value ("" = the Hobby norm) so the affiliate
    // branches (`rel="sponsored"`, disclosure lines) fold OUT of client
    // bundles entirely while unset — an undefined NEXT_PUBLIC var is left as
    // a runtime lookup and its dead branches would ship. Empty on Hobby
    // always (non-commercial plan); see .env.example.
    NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE: process.env.NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE ?? "",
  },
  // `:id` is one segment: the card page and its RSC requests, never the
  // preview image (/cards/:id/opengraph-image-…), the card sitemaps
  // (/cards/sitemap/N.xml) or /cards itself.
  async headers() {
    return [
      {
        source: "/cards/:id",
        headers: [{ key: "CDN-Cache-Control", value: CARD_PAGE_CDN_CACHE_CONTROL }],
      },
    ];
  },
};

export default nextConfig;
