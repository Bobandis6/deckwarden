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
