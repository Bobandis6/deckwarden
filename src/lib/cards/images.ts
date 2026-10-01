/**
 * MTG card image URLs, derived from the Scryfall printing id (build plan §4:
 * no image URLs stored — `card_printings.id` IS the scryfall card id, and the
 * documented CDN pattern does the rest). `image_override` holds the rare
 * mismatches, written by the ingest post-pass as {front, back} full URLs.
 *
 * Attribution rule (CLAUDE.md): full-card versions include the artist/© line
 * in the frame; `art_crop` may only be rendered with artist + © visible nearby.
 */

export type ImageVersion = "small" | "normal" | "large" | "png" | "art_crop" | "border_crop";
export type ImageFace = "front" | "back";

export interface ImageOverride {
  front?: string | null;
  back?: string | null;
}

export function scryfallImageUrl(
  printingId: string,
  version: ImageVersion = "normal",
  face: ImageFace = "front",
): string {
  const ext = version === "png" ? "png" : "jpg";
  return `https://cards.scryfall.io/${version}/${face}/${printingId[0]}/${printingId[1]}/${printingId}.${ext}`;
}

/**
 * URL for a printing row, honoring image_override. Overrides are stored at
 * `normal` size and served as-is for every requested version — they are rare
 * enough (a handful per 90k printings) that exact sizing doesn't matter.
 */
export function printingImageUrl(
  printing: { id: string; imageOverride?: unknown },
  version: ImageVersion = "normal",
  face: ImageFace = "front",
): string {
  const override = printing.imageOverride as ImageOverride | null | undefined;
  const overridden = face === "back" ? override?.back : override?.front;
  if (overridden) return overridden;
  return scryfallImageUrl(printing.id, version, face);
}

/**
 * Bandai's card-image host serves `Cross-Origin-Resource-Policy: same-site`
 * (verified 2026-09-03 on en. and asia-en.onepiece-cardgame.com), so browsers
 * REFUSE cross-site embeds — a Bandai URL in image_override is data
 * provenance and the mirror job's download source, never a renderable src.
 * OP images render from the R2 mirror instead: image_override has pointed
 * there since P4.1 (r2.dev), and at img.deckwarden.gg since P4.9.
 */
export function isEmbeddableImageUrl(url: string): boolean {
  return !/^https:\/\/[^/]*onepiece-cardgame\.com\//.test(url);
}

/** printingImageUrl, returning null instead of a URL browsers will refuse to render. */
export function embeddablePrintingImageUrl(
  printing: { id: string; imageOverride?: unknown },
  version: ImageVersion = "normal",
  face: ImageFace = "front",
): string | null {
  const url = printingImageUrl(printing, version, face);
  return isEmbeddableImageUrl(url) ? url : null;
}

/**
 * The One Piece mirror's public host (P4.9): the R2 bucket `deckwarden-public`
 * behind its Cloudflare custom domain. The ingest writes
 * `<host>/optcg/images/<KEY>.png` into image_override (punk-map.ts); the
 * bucket's r2.dev development URL is rate-limited, so thumbnails never
 * derive from it.
 */
export const OPTCG_IMAGE_HOST = "https://img.deckwarden.gg";

/** The mirror job's small-rendition prefix, beside `optcg/images/` (mirror-optcg-images.sh; test-pinned). */
export const OPTCG_SMALL_PREFIX = "optcg/small";

/**
 * The One Piece `small` rendition (P4.9, LATER row 51's consumer half). It
 * uses Scryfall's `small` box, 146 × 204. Bandai's 600 × 838 PNGs are the
 * same 63 × 88 card, so nothing is cropped and the © line stays in the
 * pixels. The format is WebP q80 with the alpha kept: the mirror PNGs'
 * rounded corners are transparent over white on some cards and black on
 * others, so JPEG would bake mismatched corners in at the same size.
 * Measured 2026-10-01 over twelve mirror PNGs, the mean is 10,141 B, against
 * 174,375 B for the full PNG and about 11.7 KB for a Scryfall `small` JPG.
 */
export const OPTCG_SMALL_IMAGE = { width: 146, height: 204, quality: 80 } as const;

const OPTCG_MIRROR_URL = /^https:\/\/img\.deckwarden\.gg\/optcg\/images\/([A-Za-z0-9_-]+)\.png$/;

/**
 * The small rendition of a full-size mirror URL on img.deckwarden.gg
 * (`…/optcg/images/OP15-058.png` → `…/optcg/small/OP15-058.webp`), or null
 * for any other URL, r2.dev included.
 */
export function optcgSmallImageUrl(url: string): string | null {
  const key = OPTCG_MIRROR_URL.exec(url)?.[1];
  return key ? `${OPTCG_IMAGE_HOST}/${OPTCG_SMALL_PREFIX}/${key}.webp` : null;
}

/**
 * Downsize an already-resolved display URL to the `small` CDN rendition.
 * Exists for consumers that only hold the wire's `card.image` (the default
 * printing was resolved server-side, so the printing id isn't available to
 * re-derive from) — e.g. the sample-hand widget's 7-card fan. Rewrites only
 * the documented cards.scryfall.io pattern; override URLs (stored at `normal`,
 * served as-is for every version) and anything else pass through untouched,
 * the One Piece mirror's full PNG included (LATER: the sample hand's small
 * rendition).
 */
export function toSmallImage(url: string): string {
  return url.replace(/^(https:\/\/cards\.scryfall\.io\/)normal(\/)/, "$1small$2");
}

/**
 * The `small` thumbnail for every small box: search and suggest rows, the
 * printings lists, deck tiles, the home shelves and the index grids (R3 F6,
 * R5a). Magic gets Scryfall's `small` for its `normal` CDN URLs. One Piece
 * gets the mirror's small WebP for an img.deckwarden.gg PNG (P4.9). Anything
 * else is null, which means "no <img>": the box keeps its spacer or
 * gradient, never a broken src. r2.dev URLs stay null too.
 *
 * Why a second rendition instead of the full PNG (P4.9, decided on bytes
 * measured 2026-10-01): a full mirror PNG averages 174,375 B, the small WebP
 * 10,141 B. The full PNG would make a 20-row search page about 3.5 MB and
 * the 142-leader /leaders grid about 24.8 MB; the small renditions make
 * them about 0.2 MB and 1.4 MB, Magic's own `small` budget. Cloudflare Image
 * Transformations were the third option, but the Free plan's 5,000 unique
 * transformations a month barely covers the 4,843 printings at one size,
 * and past the cap new ones fail with error 9422.
 */
export function thumbnailUrl(image: string | null): string | null {
  if (!image) return null;
  if (/^https:\/\/cards\.scryfall\.io\/normal\//.test(image)) return toSmallImage(image);
  return optcgSmallImageUrl(image);
}
