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
 * The two hosts a card image may render from — Scryfall's CDN and the One
 * Piece mirror at img.deckwarden.gg — and nothing else (S6,
 * SECURITY-AUDIT-report.md L12). `image_override` is written by the ingest
 * post-passes from upstream data, so until S6 any URL an upstream handed
 * over became an `<img src>` on every surface that renders a printing;
 * the gate was a blocklist of one host (Bandai's, whose
 * `Cross-Origin-Resource-Policy: same-site` — verified 2026-09-03 on en.
 * and asia-en.onepiece-cardgame.com — makes browsers refuse the embed
 * anyway, so a Bandai URL is data provenance and the mirror job's download
 * source, never a renderable src). An allowlist says the same thing the
 * Content Security Policy's `img-src` says (next.config.ts): a host that
 * is not on it would be blocked by the browser, so null — "no <img>",
 * the box keeps its spacer — is the honest answer here too. The r2.dev era
 * (P4.1 to P4.9) is off the list on purpose: that host is rate-limited and
 * nothing has pointed at it since the P4.9 flip.
 */
const EMBEDDABLE_IMAGE_HOSTS = ["https://cards.scryfall.io/", "https://img.deckwarden.gg/"];

export function isEmbeddableImageUrl(url: string): boolean {
  return EMBEDDABLE_IMAGE_HOSTS.some((prefix) => url.startsWith(prefix));
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
 * Downsize an already-resolved display URL to the `small` rendition.
 * Exists for consumers that only hold the wire's `card.image` (the default
 * printing was resolved server-side, so the printing id isn't available to
 * re-derive from) — e.g. the sample-hand widget's 7-card fan. Rewrites the
 * documented cards.scryfall.io pattern and, since U6 (LATER row 143), the One
 * Piece mirror's full PNG to its small WebP (about 10 KB against 174 KB);
 * override URLs (stored at `normal`, served as-is for every version) and
 * anything else, r2.dev included, pass through untouched — a full image,
 * never a broken one.
 */
export function toSmallImage(url: string): string {
  return (
    optcgSmallImageUrl(url) ??
    url.replace(/^(https:\/\/cards\.scryfall\.io\/)normal(\/)/, "$1small$2")
  );
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
