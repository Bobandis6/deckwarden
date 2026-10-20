/**
 * next.config.ts pins (S0, SECURITY-AUDIT-report.md L20 and the portability
 * rules): the image optimizer stays off — every image renders through a
 * plain <img>, so /_next/image is attack surface and quota, nothing else —
 * and the build keeps standalone output off Vercel. Since 2026-10-18 (the
 * ISR write budget) the card pages carry the CDN header that keeps them at
 * Vercel's CDN, matched through Next's own route compiler so the pattern
 * is proven to catch card pages and nothing beside them. Since S5 (M5)
 * every response carries the security header set and the report-only
 * Content Security Policy, and `x-powered-by` is off.
 */
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../../next.config";

const PRODUCTION_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://cards.scryfall.io https://img.deckwarden.gg https://cdn.discordapp.com https://lh3.googleusercontent.com; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'";

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** The header value a rule sends under `key`, or undefined. */
function headerValue(rule: { headers: Array<{ key: string; value: string }> }, key: string) {
  return rule.headers.find((h) => h.key === key)?.value;
}

describe("next.config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("turns the image optimizer off (images.unoptimized)", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });

  it("keeps standalone output off Vercel (the portability rule)", () => {
    expect(process.env.VERCEL).toBeUndefined();
    expect(nextConfig.output).toBe("standalone");
  });

  it("sends no x-powered-by (M5)", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sends the security header set and the report-only CSP on every path (M5)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({
      source: "/:path*",
      headers: [
        ...SECURITY_HEADERS,
        { key: "Content-Security-Policy-Report-Only", value: PRODUCTION_CSP },
      ],
    });
    // Report-only until a day of production traffic shows no violation the
    // owner cannot explain (LATER.md row 286): no enforcing header yet.
    expect(headerValue(rules[0], "Content-Security-Policy")).toBeUndefined();
    expect(headerValue(rules[1], "Content-Security-Policy-Report-Only")).toBeUndefined();
    // The dev console is the reader; no reporting endpoint spends quota.
    expect(PRODUCTION_CSP).not.toMatch(/report-uri|report-to/);

    const matches = new RegExp(buildCustomRoute("header", rules[0]).regex);
    for (const path of [
      "/",
      "/account",
      "/d/jhr5ax43ewx7",
      "/api/decks/ff5c1a8b-6722-4d3d-8cb8-59855ae75960/cards",
      "/api/auth/callback/discord",
      "/cards/ff5c1a8b-6722-4d3d-8cb8-59855ae75960/opengraph-image-g2nmy",
      "/c/azusa-lost-but-seeking",
      "/decks/ff5c1a8b-6722-4d3d-8cb8-59855ae75960/edit",
      "/_next/static/immutable/chunks/0-td1cezd-8nd.js",
    ]) {
      expect(matches.test(path), path).toBe(true);
    }
  });

  it("lets the browser Sentry SDK reach its ingest host, by origin only", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SENTRY_DSN",
      "https://examplePublicKey@o4500000.ingest.us.sentry.io/4500000001",
    );
    const [siteWide] = await nextConfig.headers!();
    const csp = headerValue(siteWide, "Content-Security-Policy-Report-Only")!;
    expect(csp).toContain("connect-src 'self' https://o4500000.ingest.us.sentry.io; ");
    expect(csp).not.toContain("examplePublicKey");
    expect(csp).not.toContain("4500000001");
    expect(
      csp.replace("connect-src 'self' https://o4500000.ingest.us.sentry.io", "connect-src 'self'"),
    ).toBe(PRODUCTION_CSP);
  });

  it("ignores a DSN that is not a URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "not a dsn");
    const [siteWide] = await nextConfig.headers!();
    expect(headerValue(siteWide, "Content-Security-Policy-Report-Only")).toBe(PRODUCTION_CSP);
  });

  it("allows eval in development only (React's server error stacks)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);
    vi.stubEnv("NODE_ENV", "development");
    const [dev] = await nextConfig.headers!();
    expect(headerValue(dev, "Content-Security-Policy-Report-Only")).toBe(
      PRODUCTION_CSP.replace(
        "script-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      ),
    );
    vi.stubEnv("NODE_ENV", "production");
    const [prod] = await nextConfig.headers!();
    expect(headerValue(prod, "Content-Security-Policy-Report-Only")).toBe(PRODUCTION_CSP);
    expect(PRODUCTION_CSP).not.toContain("unsafe-eval");
  });

  it("sends CDN-Cache-Control on the card pages and nowhere else", async () => {
    const rules = await nextConfig.headers!();
    expect(rules[1]).toEqual({
      source: "/cards/:id",
      headers: [
        {
          key: "CDN-Cache-Control",
          value: "public, max-age=3600, stale-while-revalidate=86400",
        },
      ],
    });
    expect(headerValue(rules[0], "CDN-Cache-Control")).toBeUndefined();
    const matches = new RegExp(buildCustomRoute("header", rules[1]).regex);
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
