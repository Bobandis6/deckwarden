import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portability rule: build must run on any Node host (Hetzner runbook), not just Vercel.
  // Vercel's build packaging breaks on standalone output (ENOENT next-server.js.nft.json),
  // and it doesn't need it — so standalone applies everywhere except Vercel itself.
  output: process.env.VERCEL ? undefined : "standalone",
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
