import type { NextConfig } from "next";

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
};

export default nextConfig;
