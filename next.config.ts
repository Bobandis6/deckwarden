import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portability rule: build must run on any Node host (Hetzner runbook), not just Vercel.
  output: "standalone",
};

export default nextConfig;
