/**
 * The card-page printings gallery's wire shape (W5, WAVE2.md D4): one slim
 * row per printing, shared by the page (≤ INLINE_PRINTINGS_MAX rows inlined
 * into the HTML) and /api/cards/[id]/printings (the capped tail). Lean rows
 * by design: no image URLs cross the wire — the client derives them from the
 * printing id with `images.ts` — except `imageOverride`, which IS the stored
 * exception and rides along only when non-null.
 */

import type { ImageOverride } from "@/lib/cards/images";

/** Rows inlined into the page HTML; the rest come from the API on "Show all". */
export const INLINE_PRINTINGS_MAX = 100;
/** The API's hard cap — the cap IS the pagination ("Showing 250 of N"). */
export const API_PRINTINGS_CAP = 250;

export interface GalleryPrinting {
  id: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string | null;
  /** Release year for captions; the full date stays server-side. */
  year: number | null;
  isDefault: boolean;
  hasBack: boolean;
  usd: string | null;
  usdFoil: string | null;
  imageOverride?: ImageOverride;
}

export interface PrintingRow {
  id: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string | null;
  releasedAt: string | null;
  isDefault: boolean;
  hasBack: boolean;
  prices: unknown;
  imageOverride: unknown;
}

export function toGalleryPrinting(row: PrintingRow): GalleryPrinting {
  const prices = (row.prices ?? {}) as Record<string, string | null>;
  const slim: GalleryPrinting = {
    id: row.id,
    setCode: row.setCode,
    setName: row.setName,
    collectorNumber: row.collectorNumber,
    rarity: row.rarity,
    year: row.releasedAt ? Number(row.releasedAt.slice(0, 4)) : null,
    isDefault: row.isDefault,
    hasBack: row.hasBack,
    usd: prices.usd || null,
    usdFoil: prices.usd_foil || null,
  };
  if (row.imageOverride) slim.imageOverride = row.imageOverride as ImageOverride;
  return slim;
}

/**
 * Caption-friendly rarity: Scryfall's lowercase words get capitalized (only
 * "uncommon" is long enough to earn an abbreviation — the D4 sketch's
 * "Unc."); One Piece's printed codes ("SR", "UC", "Leader") pass through.
 */
export function rarityLabel(rarity: string | null): string | null {
  if (!rarity) return null;
  if (rarity === "uncommon") return "Unc.";
  if (/^[a-z]/.test(rarity)) return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  return rarity;
}

/** The D4 caption line: "CMM · #410 · Unc." — preview popups and the drawer. */
export function printingCaption(p: GalleryPrinting): string {
  const parts = [`${p.setCode.toUpperCase()} · #${p.collectorNumber}`];
  const rarity = rarityLabel(p.rarity);
  if (rarity) parts.push(rarity);
  return parts.join(" · ");
}
