/**
 * Card art (R2, REDESIGN.md §3): the Scryfall art-crop resolver the OG
 * images have used since P2.6, refactored out of src/lib/og/scryfall.ts so
 * the builder's ambient layer, the share page and (R5b) the hub banners
 * resolve art the one way, plus the shared nullable `CardArt` descriptor
 * all of them render from.
 *
 * Source of truth is the Scryfall API by PRINTING id — never a derived CDN
 * URL — because the artist credit lives only there (LATER row 49: no
 * artist column; the lean-row rule). Two consequences worth stating:
 * `image_override` never applies to art (it overrides a printing's
 * FULL-CARD image; the API's `image_uris.art_crop` is authoritative for the
 * crop), and the blocked-host gate in images.ts is moot here — Scryfall's
 * CDN embeds fine and no other host ever appears, because a game whose
 * printings live elsewhere declares no ambient art (One Piece) and so never
 * reaches this resolver.
 *
 * Attribution enforcement (CLAUDE.md hard rule): art_crop renders only with
 * artist + © visible nearby, so a missing artist returns null — never
 * unattributed art. `artCredit` is the ONE builder of that line; the OG
 * attribution chip and the ambient layer's chip both read it.
 *
 * Caching intent: per-URL data cache, revalidated daily (`next.revalidate`
 * on the fetch) — art and artist for a printing are effectively immutable,
 * and the cache is keyed by printing, so every deck sharing a commander
 * reuses one fetch whoever asks and from whichever route (the force-dynamic
 * deck OG image and the art endpoint included).
 */
import type { GameAdapter } from "@/lib/games/types";

export const SCRYFALL_USER_AGENT = "Deckwarden/1.0 (https://deckwarden.gg)";
export const SCRYFALL_REVALIDATE_S = 86400;

export type CardArtLayout = "art_crop" | "full_card";

/** What a surface renders: the image, how it was cut, and the line that must sit beside it. */
export interface CardArt {
  url: string;
  layout: CardArtLayout;
  artist?: string;
  /** The attribution line ("Art: … · ™ & © Wizards of the Coast") — rendered wherever `url` is. */
  credit: string;
}

export interface ScryfallArtMeta {
  artCropUrl: string;
  artist: string;
}

/** Only the fields the art path reads; the ingest's ScryfallCard stays untouched. */
interface ScryfallArtCard {
  artist?: string;
  image_uris?: { art_crop?: string };
  card_faces?: Array<{ artist?: string; image_uris?: { art_crop?: string } }>;
}

/** The one attribution line for Magic art crops (the OG chip and the ambient chip both read it). */
export function artCredit(artist: string): string {
  return `Art: ${artist} · ™ & © Wizards of the Coast`;
}

/**
 * Art crop + artist for a printing, from the Scryfall API. Double-faced
 * cards use the FRONT face (`card_faces[0]`) — a per-face choice is not a
 * feature anyone has asked for. A missing crop OR artist is null (the
 * attribution rule); so is any non-OK response or thrown fetch — callers
 * degrade to their artless rendering, never to a 500.
 */
export async function fetchScryfallArtMeta(printingId: string): Promise<ScryfallArtMeta | null> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${printingId}`, {
      headers: { "User-Agent": SCRYFALL_USER_AGENT, Accept: "application/json" },
      next: { revalidate: SCRYFALL_REVALIDATE_S },
    });
    if (!res.ok) return null;
    const card = (await res.json()) as ScryfallArtCard;
    const face = card.card_faces?.[0];
    const artCropUrl = card.image_uris?.art_crop ?? face?.image_uris?.art_crop;
    const artist = card.artist ?? face?.artist;
    if (!artCropUrl || !artist) return null;
    return { artCropUrl, artist };
  } catch {
    return null;
  }
}

/** The descriptor for a resolved crop — the credit built once, here. */
export function artCropCardArt(meta: ScryfallArtMeta): CardArt {
  return {
    url: meta.artCropUrl,
    layout: "art_crop",
    artist: meta.artist,
    credit: artCredit(meta.artist),
  };
}

/**
 * The adapter gate every art consumer applies first: the kind of ambient
 * art a game declares, or null when it declares none (One Piece —
 * REDESIGN.md §3 records the decision). Null means no request is made,
 * anywhere, for that game's cards.
 */
export function ambientArtKind(adapter: Pick<GameAdapter, "capabilities">): CardArtLayout | null {
  return adapter.capabilities.ambientArt?.kind ?? null;
}

/**
 * Art for one printing of a card in `adapter`'s game — the decision the
 * endpoint and the share page make identically: no declared kind → null
 * before any network; `art_crop` → the Scryfall resolver. Nothing declares
 * `full_card`, and no resolver exists for it.
 */
export async function resolveCardArt(
  adapter: Pick<GameAdapter, "capabilities">,
  printingId: string,
): Promise<CardArt | null> {
  if (ambientArtKind(adapter) !== "art_crop") return null;
  const meta = await fetchScryfallArtMeta(printingId);
  return meta ? artCropCardArt(meta) : null;
}
