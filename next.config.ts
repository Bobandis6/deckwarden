import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portability rule: build must run on any Node host (Hetzner runbook), not just Vercel.
  // Vercel's build packaging breaks on standalone output (ENOENT next-server.js.nft.json),
  // and it doesn't need it — so standalone applies everywhere except Vercel itself.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
