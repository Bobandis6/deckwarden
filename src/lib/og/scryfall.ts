/**
 * Scryfall art for OG rendering (P2.6; a wrapper since R2).
 *
 * The art crop + artist resolution moved to src/lib/cards/art.ts so the
 * builder's ambient layer and the share page resolve the same way; this
 * module keeps the OG-only half: fetching the crop's bytes into a data URI,
 * because satori's own image fetching would not send the real User-Agent the
 * CLAUDE.md header rule requires on every Scryfall request. The deck preview
 * calls `fetchOgArt`; the card and hub previews call `lookupOgArt`, whose
 * `transient` says the art failed rather than doesn't exist, so the CDN isn't
 * handed an artless image to keep for a day.
 *
 * Caching intent: per-URL data cache, revalidate daily on both fetches —
 * explicit per-fetch revalidate keeps this cached even inside the
 * force-dynamic deck OG route. A missing artist is null art (the
 * attribution rule, enforced in the resolver), and any failure degrades to
 * an artless unfurl, never a 500.
 */
import { lookupScryfallArtMeta, SCRYFALL_REVALIDATE_S, SCRYFALL_USER_AGENT } from "@/lib/cards/art";

export interface OgArt {
  /** data: URI so satori never fetches Scryfall itself. */
  dataUri: string;
  artist: string;
}

export async function lookupOgArt(
  printingId: string,
): Promise<{ art: OgArt | null; transient: boolean }> {
  try {
    const lookup = await lookupScryfallArtMeta(printingId);
    if (!("meta" in lookup)) return { art: null, transient: lookup.reason === "unreachable" };
    const img = await fetch(lookup.meta.artCropUrl, {
      headers: { "User-Agent": SCRYFALL_USER_AGENT, Accept: "image/*" },
      next: { revalidate: SCRYFALL_REVALIDATE_S },
    });
    if (!img.ok) return { art: null, transient: true };
    const base64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    return {
      art: { dataUri: `data:image/jpeg;base64,${base64}`, artist: lookup.meta.artist },
      transient: false,
    };
  } catch {
    // An unfurl must degrade to an artless image, never 500.
    return { art: null, transient: true };
  }
}

export async function fetchOgArt(printingId: string): Promise<OgArt | null> {
  return (await lookupOgArt(printingId)).art;
}
