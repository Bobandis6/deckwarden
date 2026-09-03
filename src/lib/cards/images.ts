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
 * OP images become displayable when the R2 mirror gets its public domain
 * (owner step) and a re-ingest re-points overrides at it.
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
 * Downsize an already-resolved display URL to the `small` CDN rendition.
 * Exists for consumers that only hold the wire's `card.image` (the default
 * printing was resolved server-side, so the printing id isn't available to
 * re-derive from) — e.g. the sample-hand widget's 7-card fan. Rewrites only
 * the documented cards.scryfall.io pattern; override URLs (stored at `normal`,
 * served as-is for every version) and anything else pass through untouched.
 */
export function toSmallImage(url: string): string {
  return url.replace(/^(https:\/\/cards\.scryfall\.io\/)normal(\/)/, "$1small$2");
}
