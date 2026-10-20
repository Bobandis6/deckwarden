// @vitest-environment node
/**
 * The ISR write budget (2026-10-18): the card page and the card, hub and
 * leader previews left ISR — every ISR render spent Hobby's 200K monthly
 * write units (a card page ~5, a Magic card's or a hub's ~1 MB preview up
 * to 127), every deployment starts its own empty ISR cache, and one
 * crawler sweep cost ~210K. Each route is dynamic with no ISR export left
 * behind (an empty `generateStaticParams` beside `revalidate` is what made
 * them ISR, LATER row 69), and the previews render as JPEG under their
 * CDN header — real satori, real sharp; the deck preview keeps its
 * never-at-the-CDN header. The hubs, leaders and tournament pages stay ISR
 * (their own page tests pin `revalidate`).
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCardOgData: vi.fn(),
  loadDeckOgData: vi.fn(),
  loadDefaultPrintingId: vi.fn(),
  loadLeaderBySlug: vi.fn(),
  fetchOgArt: vi.fn(),
}));

vi.mock("@/lib/og/data", () => ({
  loadCardOgData: mocks.loadCardOgData,
  loadDeckOgData: mocks.loadDeckOgData,
  loadDefaultPrintingId: mocks.loadDefaultPrintingId,
}));
vi.mock("@/lib/hub/queries", () => ({
  loadLeaderBySlug: mocks.loadLeaderBySlug,
  loadDefaultPrinting: vi.fn(),
  loadStaples: vi.fn(),
}));
vi.mock("@/lib/og/scryfall", () => ({ fetchOgArt: mocks.fetchOgArt }));
// The deck preview reads the request's headers for its limiter (S4); both
// are outside this test's subject (d/[publicId]/opengraph-image.test.ts).
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: async () => null,
}));

const cardPage = await import("./cards/[id]/page");
const cardPreview = await import("./cards/[id]/opengraph-image");
const hubPreview = await import("./c/[slug]/opengraph-image");
const leaderPreview = await import("./l/[slug]/opengraph-image");
const deckPreview = await import("./d/[publicId]/opengraph-image");

const CDN = "public, s-maxage=86400, stale-while-revalidate=86400";
const UNCACHED = "public, max-age=0, must-revalidate";

async function expectJpeg(res: Response, cacheControl: string) {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/jpeg");
  expect(res.headers.get("cache-control")).toBe(cacheControl);
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1200, 630]);
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.fetchOgArt.mockResolvedValue(null);
});

describe("the card page", () => {
  it("is dynamic, with no ISR export left (next.config.ts gives it the CDN header)", () => {
    expect(cardPage.dynamic).toBe("force-dynamic");
    expect(cardPage).not.toHaveProperty("revalidate");
    expect(cardPage).not.toHaveProperty("generateStaticParams");
  });
});

describe("the previews", () => {
  it("card, hub and leader previews are dynamic JPEGs with no ISR export", () => {
    for (const mod of [cardPreview, hubPreview, leaderPreview]) {
      expect(mod.dynamic).toBe("force-dynamic");
      expect(mod.contentType).toBe("image/jpeg");
      expect(mod.size).toEqual({ width: 1200, height: 630 });
      expect(mod).not.toHaveProperty("revalidate");
      expect(mod).not.toHaveProperty("generateStaticParams");
    }
    expect(deckPreview.dynamic).toBe("force-dynamic");
    expect(deckPreview.contentType).toBe("image/jpeg");
  });

  it("a card's preview renders a 1200×630 JPEG the CDN keeps for a day", async () => {
    mocks.loadCardOgData.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      gameId: 1,
      name: "Sol Ring",
      typeLine: "Artifact",
      isLeaderCandidate: false,
    });
    mocks.loadDefaultPrintingId.mockResolvedValue("22222222-2222-4222-8222-222222222222");
    const res = await cardPreview.default({ params: Promise.resolve({ id: "x" }) });
    await expectJpeg(res, CDN);
    expect(mocks.fetchOgArt).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });

  it("an unknown card, hub or leader gets the generic JPEG under the same CDN header", async () => {
    mocks.loadCardOgData.mockResolvedValue(null);
    mocks.loadLeaderBySlug.mockResolvedValue(null);
    await expectJpeg(await cardPreview.default({ params: Promise.resolve({ id: "x" }) }), CDN);
    await expectJpeg(await hubPreview.default({ params: Promise.resolve({ slug: "x" }) }), CDN);
    await expectJpeg(await leaderPreview.default({ params: Promise.resolve({ slug: "x" }) }), CDN);
  });

  it("a private deck's preview is the generic JPEG, still never kept at the CDN", async () => {
    mocks.loadDeckOgData.mockResolvedValue({ visibility: "private" });
    const res = await deckPreview.default({ params: Promise.resolve({ publicId: "abc" }) });
    await expectJpeg(res, UNCACHED);
  });
});
