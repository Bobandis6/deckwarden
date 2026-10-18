// @vitest-environment node
/**
 * `jpegPreview` (2026-10-18): a real PNG through real sharp — the bytes
 * come back as a JPEG of the same 1200×630 under the route's header and
 * status, and an encoder failure serves the original bytes as image/png
 * under the same header instead of a 500.
 */
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  jpegPreview,
  OG_CDN_CACHE_CONTROL,
  OG_JPEG_QUALITY,
  OG_UNCACHED_CACHE_CONTROL,
} from "./jpeg";

/** A gradient under fine grain: art-like pixels, which PNG stores big and JPEG small. */
async function pngOf(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const grain = ((seed >>> 24) % 17) - 8;
      const i = (y * width + x) * 3;
      raw[i] = Math.max(0, Math.min(255, (x * 255) / width + grain));
      raw[i + 1] = Math.max(0, Math.min(255, (y * 255) / height + grain));
      raw[i + 2] = Math.max(0, Math.min(255, 128 + grain));
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("jpegPreview", () => {
  it("re-encodes the PNG as a smaller JPEG of the same size, with the route's header and status", async () => {
    const png = await pngOf(1200, 630);
    const res = await jpegPreview(
      new Response(new Uint8Array(png), { status: 200 }),
      OG_CDN_CACHE_CONTROL,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=86400, stale-while-revalidate=86400",
    );
    const jpeg = Buffer.from(await res.arrayBuffer());
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(jpeg.length).toBeLessThan(png.length / 10);
    const meta = await sharp(jpeg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1200, 630]);
    expect(OG_JPEG_QUALITY).toBe(80);
  });

  it("keeps the deck preview's header uncached at the CDN (the /d privacy contract)", async () => {
    const res = await jpegPreview(
      new Response(new Uint8Array(await pngOf(40, 20))),
      OG_UNCACHED_CACHE_CONTROL,
    );
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(res.headers.get("cache-control")).not.toMatch(/s-maxage/);
  });

  it("serves the original bytes as image/png when the encoder fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const notAnImage = new TextEncoder().encode("not an image");
    const res = await jpegPreview(new Response(notAnImage), OG_CDN_CACHE_CONTROL);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(OG_CDN_CACHE_CONTROL);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(notAnImage);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
