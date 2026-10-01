/**
 * The One Piece `small` rendition (P4.9): one full mirror PNG in, the WebP
 * the small boxes load out. It fits inside OPTCG_SMALL_IMAGE's 146 × 204,
 * is never cropped or enlarged, and keeps the alpha (q80). Only the mirror
 * job calls it (scripts/optcg-image-small.ts).
 *
 * sharp is a devDependency, at the version Next already pulls in: the
 * Actions runner image (ubuntu-24.04) ships no ImageMagick, libvips or
 * cwebp, and sharp's prebuilt binaries arrive with the lockfile.
 */
import sharp from "sharp";

import { OPTCG_SMALL_IMAGE } from "@/lib/cards/images";

export function renderOptcgSmallImage(png: Buffer): Promise<Buffer> {
  const { width, height, quality } = OPTCG_SMALL_IMAGE;
  return sharp(png)
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}
