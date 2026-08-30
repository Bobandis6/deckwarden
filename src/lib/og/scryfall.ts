/**
 * Scryfall art + artist for OG rendering (P2.6).
 *
 * Artist is deliberately NOT in our schema (lean-row rule), so the renderer
 * asks Scryfall at render time. Both fetches carry the real User-Agent —
 * the CLAUDE.md header rule covers ALL Scryfall requests, and satori's own
 * image fetching wouldn't send it, which is why the art is fetched here and
 * handed to satori as a data URI instead of a URL.
 *
 * Caching intent: per-URL data cache, revalidate daily (`next.revalidate`
 * on each fetch) — art and artist for a printing are effectively immutable,
 * and the cache is keyed by printing, so every deck sharing a commander
 * reuses one fetch. Explicit per-fetch revalidate keeps this cached even
 * inside the force-dynamic deck OG route.
 *
 * Attribution enforcement: art_crop may only render with artist + © in the
 * image (CLAUDE.md hard rule), so a missing artist returns null art — the
 * caller falls back to an artless layout rather than an unattributed one.
 */
const UA = "Deckwarden/1.0 (https://deckwarden.gg)";
const REVALIDATE_S = 86400;

/** Only the fields the OG path reads; the ingest's ScryfallCard stays untouched. */
interface ScryfallOgCard {
  artist?: string;
  image_uris?: { art_crop?: string };
  card_faces?: Array<{ artist?: string; image_uris?: { art_crop?: string } }>;
}

export interface OgArt {
  /** data: URI so satori never fetches Scryfall itself. */
  dataUri: string;
  artist: string;
}

export async function fetchOgArt(printingId: string): Promise<OgArt | null> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${printingId}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: REVALIDATE_S },
    });
    if (!res.ok) return null;
    const card = (await res.json()) as ScryfallOgCard;
    const face = card.card_faces?.[0];
    const artUrl = card.image_uris?.art_crop ?? face?.image_uris?.art_crop;
    const artist = card.artist ?? face?.artist;
    if (!artUrl || !artist) return null;

    const img = await fetch(artUrl, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      next: { revalidate: REVALIDATE_S },
    });
    if (!img.ok) return null;
    const base64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    return { dataUri: `data:image/jpeg;base64,${base64}`, artist };
  } catch {
    // An unfurl must degrade to an artless image, never 500.
    return null;
  }
}
