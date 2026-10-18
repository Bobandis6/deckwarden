/**
 * Preview images as JPEG (2026-10-18, the ISR write budget; the owner's
 * call). satori renders PNG only, and a 1200×630 PNG with full-bleed art
 * runs to a megabyte — measured on the 0e94988 build: a Magic card's
 * preview 1,035,110 B, a commander hub's 1,019,799 B — where a quality-80
 * mozjpeg JPEG of the same pixels is 83,754 and 80,468 B (an artless One
 * Piece leader's 43,436 → 17,192 B), about 55 ms of sharp on a laptop.
 * The card, hub and leader previews left ISR the same day, so their size
 * no longer costs ISR writes; it still costs Fast Origin Transfer (Hobby's
 * 10 GB a month) on every render that misses the CDN, every unfurl's
 * download, and WhatsApp drops previews past ~300 KB.
 *
 * `jpegPreview` re-encodes an ImageResponse and sets the route's
 * Cache-Control. A render error inside the ImageResponse surfaces exactly
 * as before (reading the body is what renders it); a sharp failure — a
 * native binary missing on some host — falls back to the PNG bytes under
 * `image/png` with the same header, so an unfurl never 500s over the
 * encoder.
 */
import sharp from "sharp";

export const OG_JPEG_QUALITY = 80;

/**
 * Card, commander-hub and leader previews: Vercel's CDN keeps one for a
 * day and serves it stale for another while the next request re-renders
 * it — the daily freshness the ISR routes had, with CDN cache writes free
 * where ISR writes spend the Hobby budget. Vercel strips `s-maxage` and
 * `stale-while-revalidate` before the browser sees the header.
 */
export const OG_CDN_CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=86400";

/**
 * Deck previews: never kept at the CDN — a deck flipped private must stop
 * unfurling on the next request (the /d privacy contract). This is the
 * header ImageResponse sends by default in production, so the deck
 * preview's caching is unchanged.
 */
export const OG_UNCACHED_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export async function jpegPreview(image: Response, cacheControl: string): Promise<Response> {
  const png = Buffer.from(await image.arrayBuffer());
  let body: Buffer = png;
  let contentType = "image/png";
  try {
    body = await sharp(png).jpeg({ quality: OG_JPEG_QUALITY, mozjpeg: true }).toBuffer();
    contentType = "image/jpeg";
  } catch (err) {
    console.error("[og] JPEG encode failed, serving the PNG", err);
  }
  return new Response(new Uint8Array(body), {
    status: image.status,
    headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
  });
}
