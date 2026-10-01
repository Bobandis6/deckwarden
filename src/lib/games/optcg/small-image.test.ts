// @vitest-environment node
/**
 * The mirror's small rendition (P4.9). A Bandai-shaped 600 × 838 PNG, with
 * transparent rounded corners like all twelve mirror PNGs measured
 * 2026-10-01, comes out as WebP in Scryfall's `small` box (146 × 204). Its
 * corners stay transparent, its body stays opaque, and the stripe where the
 * © line sits survives: the card is resized whole, never cropped.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { renderOptcgSmallImage } from "./small-image";

const W = 600;
const H = 838;
const RADIUS = 28;
const PURPLE = [0x6a, 0x1b, 0x9a];
const YELLOW = [0xf9, 0xa8, 0x25];

/** Outside the rounded rectangle: one of the four corner squares, beyond its arc. */
function inCorner(x: number, y: number): boolean {
  const cx = x < RADIUS ? RADIUS : x >= W - RADIUS ? W - 1 - RADIUS : null;
  const cy = y < RADIUS ? RADIUS : y >= H - RADIUS ? H - 1 - RADIUS : null;
  return cx !== null && cy !== null && (x - cx) ** 2 + (y - cy) ** 2 > RADIUS ** 2;
}

async function bandaiShapedPng(): Promise<Buffer> {
  const pixels = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (inCorner(x, y)) continue; // transparent (all zero)
      const stripe = y >= 770 && y < 826 && x >= 60 && x < 540;
      const [r, g, b] = stripe ? YELLOW : PURPLE;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toBuffer();
}

describe("renderOptcgSmallImage", () => {
  it("writes WebP in the 146 × 204 small box with the alpha kept and nothing cropped", async () => {
    const webp = await renderOptcgSmallImage(await bandaiShapedPng());
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([146, 204]);
    expect(meta.hasAlpha).toBe(true);

    const { data, info } = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    // Corners stay transparent: no white or black box around the card.
    expect(at(0, 0)[3]).toBe(0);
    expect(at(145, 203)[3]).toBe(0);
    // The body is opaque purple.
    const [r, g, b, a] = at(73, 102);
    expect(a).toBe(255);
    expect(Math.abs(r - PURPLE[0])).toBeLessThan(24);
    expect(Math.abs(g - PURPLE[1])).toBeLessThan(24);
    expect(Math.abs(b - PURPLE[2])).toBeLessThan(24);
    // The bottom stripe (the © line's place) is still in the frame, still yellow.
    const [sr, sg, sb] = at(73, 194);
    expect(sr).toBeGreaterThan(200);
    expect(sg).toBeGreaterThan(130);
    expect(sb).toBeLessThan(90);
  });
});
