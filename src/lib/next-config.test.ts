/**
 * next.config.ts pins (S0, SECURITY-AUDIT-report.md L20 and the portability
 * rules): the image optimizer stays off — every image renders through a
 * plain <img>, so /_next/image is attack surface and quota, nothing else —
 * and the build keeps standalone output off Vercel.
 */
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
});
