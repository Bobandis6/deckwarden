/**
 * next.config.ts pins (S0, SECURITY-AUDIT-report.md L20 and the portability
 * rules): the image optimizer stays off — every image renders through a
 * plain <img>, so /_next/image is attack surface and quota, nothing else —
 * and the build keeps standalone output off Vercel. Since 2026-10-18 (the
 * ISR write budget) the card pages carry the CDN header that keeps them at
 * Vercel's CDN, matched through Next's own route compiler so the pattern
 * is proven to catch card pages and nothing beside them.
 */
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("next.config", () => {
  it("turns the image optimizer off (images.unoptimized)", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });

  it("keeps standalone output off Vercel (the portability rule)", () => {
    expect(process.env.VERCEL).toBeUndefined();
    expect(nextConfig.output).toBe("standalone");
  });

  it("sends CDN-Cache-Control on the card pages and nowhere else", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([
      {
        source: "/cards/:id",
        headers: [
          {
            key: "CDN-Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ]);
    const matches = new RegExp(buildCustomRoute("header", rules[0]).regex);
    expect(matches.test("/cards/ff5c1a8b-6722-4d3d-8cb8-59855ae75960")).toBe(true);
    for (const path of [
      "/cards",
      "/cards/",
      "/cards/ff5c1a8b-6722-4d3d-8cb8-59855ae75960/opengraph-image-g2nmy",
      "/cards/sitemap/0.xml",
      "/c/azusa-lost-but-seeking",
      "/l/trafalgar-law-op01-002",
      "/d/jhr5ax43ewx7",
    ]) {
      expect(matches.test(path), path).toBe(false);
    }
  });
});
