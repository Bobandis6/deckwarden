/**
 * Scryfall art for OG rendering (P2.6; a wrapper since R2).
 *
 * The art crop + artist resolution moved to src/lib/cards/art.ts
 * (`fetchScryfallArtMeta`) so the builder's ambient layer and the share page
 * resolve the same way; this module keeps the OG-only half: fetching the
 * crop's bytes into a data URI, because satori's own image fetching would
 * not send the real User-Agent the CLAUDE.md header rule requires on every
 * Scryfall request. The three opengraph-image routes call `fetchOgArt`
 * exactly as before.
 *
 * Caching intent: per-URL data cache, revalidate daily on both fetches —
 * explicit per-fetch revalidate keeps this cached even inside the
 * force-dynamic deck OG route. A missing artist is null art (the
 * attribution rule, enforced in the resolver), and any failure degrades to
 * an artless unfurl, never a 500.
 */
import { fetchScryfallArtMeta, SCRYFALL_REVALIDATE_S, SCRYFALL_USER_AGENT } from "@/lib/cards/art";

export interface OgArt {
  /** data: URI so satori never fetches Scryfall itself. */
  dataUri: string;
  artist: string;
}

export async function fetchOgArt(printingId: string): Promise<OgArt | null> {
  try {
    const meta = await fetchScryfallArtMeta(printingId);
    if (!meta) return null;
    const img = await fetch(meta.artCropUrl, {
      headers: { "User-Agent": SCRYFALL_USER_AGENT, Accept: "image/*" },
      next: { revalidate: SCRYFALL_REVALIDATE_S },
    });
    if (!img.ok) return null;
    const base64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    return { dataUri: `data:image/jpeg;base64,${base64}`, artist: meta.artist };
  } catch {
    // An unfurl must degrade to an artless image, never 500.
    return null;
  }
}
