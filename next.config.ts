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

/**
 * The security response headers (S5, SECURITY-AUDIT-report.md M5), on every
 * response: pages, route handlers, the preview images and the static
 * assets alike — a header on a JSON body, a JPEG or a 302 is inert, and one
 * rule is one thing to read. Set here, never in vercel.json (the
 * portability rule: the VPS serves the same set from the same file).
 *   X-Frame-Options DENY — no site frames the editor's visibility toggle
 *     and delete or /account's controls (clickjacking); `frame-ancestors`
 *     in the policy below is the modern form of the same rule.
 *   X-Content-Type-Options nosniff — a response is what its Content-Type
 *     says, never sniffed into a script.
 *   Referrer-Policy strict-origin-when-cross-origin — a deck's or a
 *     folder's URL stays ours; Scryfall, TCGplayer and the other link
 *     targets see the origin only (the browser default since 2020, pinned).
 *   Permissions-Policy — four capabilities the site never asks for, off
 *     for this document and anything it would embed.
 *   Strict-Transport-Security — two years, subdomains included
 *     (img.deckwarden.gg is HTTPS-only already). Vercel sends a max-age of
 *     its own; off Vercel nothing would.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * Content Security Policy, report-only (S5, M5). Every source is what the
 * browser loads from this tree on 2026-10-20, nothing speculative:
 *   img-src — card images from Scryfall's CDN, the One Piece images at
 *     img.deckwarden.gg (P4.9), the provider pictures Discord and Google
 *     hand Better Auth (users.image; the chosen card art is a Scryfall
 *     crop), and `data:` for inline SVG. api.scryfall.com is read on the
 *     server only and tagger.scryfall.com is a link target, so neither is
 *     a source. The avatars' r2.dev era never renders (images.ts).
 *   font-src 'self' — the three faces are self-hosted by next/font.
 *   connect-src — every client fetch is same-origin; the browser Sentry
 *     SDK (src/instrumentation-client.ts) posts to the ingest host of
 *     NEXT_PUBLIC_SENTRY_DSN when that is set, so its origin joins the list
 *     at build time (the public key in the DSN never does).
 *   style-src 'unsafe-inline' — Base UI and shadcn position with inline
 *     style attributes, and next-themes appends a <style> at a theme flip.
 *   script-src 'unsafe-inline' — Next's bootstrap and the RSC payload are
 *     inline scripts whose text differs per page and per render (five on
 *     the home page, eleven on a hub, measured live), so no hash can name
 *     them, and a per-request nonce (src/proxy.ts) needs dynamic
 *     rendering, which would move the ISR hubs, leaders, sets, precons and
 *     event pages back to on-demand rendering and undo the 2026-10-18 ISR
 *     write budget (847e999). The trade-off and its trigger are LATER.md
 *     row 285. 'unsafe-eval' joins it in development only: React rebuilds
 *     server error stacks with eval there (Next's CSP guide), never in
 *     production.
 *   object-src 'none', base-uri 'self', form-action 'self' (every form
 *     posts or GETs here; the OAuth hops are navigations, not forms),
 *     frame-ancestors 'none'.
 * Report-only: a violation is a console line, never a blocked load, and
 * the dev console is the reader (no report-uri: a Sentry endpoint would
 * spend the error quota on extension noise — the owner's call). The switch
 * to an enforcing Content-Security-Policy is LATER.md row 286.
 */
function contentSecurityPolicy(): string {
  const development = process.env.NODE_ENV === "development";
  const connect = ["'self'"];
  const sentryIngest = sentryIngestOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (sentryIngest) connect.push(sentryIngest);
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    [
      "img-src",
      [
        "'self'",
        "data:",
        "https://cards.scryfall.io",
        "https://img.deckwarden.gg",
        "https://cdn.discordapp.com",
        "https://lh3.googleusercontent.com",
      ],
    ],
    ["font-src", ["'self'"]],
    ["connect-src", connect],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}

/** The origin the browser SDK posts envelopes to, from a DSN; null for none or a malformed one. */
function sentryIngestOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  // Portability rule: build must run on any Node host (Hetzner runbook), not just Vercel.
  // Vercel's build packaging breaks on standalone output (ENOENT next-server.js.nft.json),
  // and it doesn't need it — so standalone applies everywhere except Vercel itself.
  output: process.env.VERCEL ? undefined : "standalone",
  // S5 (M5): no `x-powered-by: Next.js` — a version hint for nothing.
  poweredByHeader: false,
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
  // Caching intent: headers change no route's rendering — the ISR pages
  // stay prerendered (a static header rule is applied at the edge, no
  // request is read) and the dynamic ones stay dynamic.
  async headers() {
    return [
      // Every path, `/` included (`:path*` is zero or more segments).
      {
        source: "/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy() },
        ],
      },
      // `:id` is one segment: the card page and its RSC requests, never the
      // preview image (/cards/:id/opengraph-image-…), the card sitemaps
      // (/cards/sitemap/N.xml) or /cards itself.
      {
        source: "/cards/:id",
        headers: [{ key: "CDN-Cache-Control", value: CARD_PAGE_CDN_CACHE_CONTROL }],
      },
    ];
  },
};

export default nextConfig;
