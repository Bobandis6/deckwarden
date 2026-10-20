// @vitest-environment node
/**
 * The deck preview's limiter (S4, SECURITY-AUDIT-report.md §7's S4
 * paragraph): the caller's IP buckets are consumed before any read or
 * render — the generic image included — and a 429 from the limiter is the
 * route's answer, with the deck never looked up. The render itself is
 * isr-budget.test.ts's (real satori, real sharp).
 */
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadDeckOgData: vi.fn(),
  loadDefaultPrintingId: vi.fn(),
  fetchOgArt: vi.fn(),
  limiter: { calls: [] as string[][], answer: null as NextResponse | null },
  headers: new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
}));

vi.mock("@/lib/og/data", () => ({
  loadDeckOgData: mocks.loadDeckOgData,
  loadDefaultPrintingId: mocks.loadDefaultPrintingId,
}));
vi.mock("@/lib/og/scryfall", () => ({ fetchOgArt: mocks.fetchOgArt }));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: async (limits: { key: string }[]) => {
    mocks.limiter.calls.push(limits.map((l) => l.key));
    return mocks.limiter.answer;
  },
}));

const preview = await import("./opengraph-image");
const render = (publicId: string) => preview.default({ params: Promise.resolve({ publicId }) });

beforeEach(() => {
  mocks.loadDeckOgData.mockReset();
  mocks.limiter.calls = [];
  mocks.limiter.answer = null;
});

describe("the deck preview's limiter", () => {
  it("consumes the address's buckets (first forwarded hop) before the deck is read", async () => {
    mocks.loadDeckOgData.mockResolvedValue(null);
    const res = await render("abcdefgh2345");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(mocks.limiter.calls).toEqual([
      ["deck-preview:ip:203.0.113.9", "deck-preview:ip-hour:203.0.113.9"],
    ]);
    expect(mocks.loadDeckOgData).toHaveBeenCalledWith("abcdefgh2345");
  });

  it("over the cap: the limiter's 429 is the answer and nothing is read or rendered", async () => {
    mocks.limiter.answer = NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": "17", "Cache-Control": "no-store" } },
    );
    const res = await render("abcdefgh2345");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("17");
    expect(mocks.loadDeckOgData).not.toHaveBeenCalled();
  });

  it("a malformed id costs the bucket too — the generic image is a render like any other", async () => {
    mocks.loadDeckOgData.mockResolvedValue(null);
    await render("not a public id");
    expect(mocks.limiter.calls).toHaveLength(1);
  });
});
