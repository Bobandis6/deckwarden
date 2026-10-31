/**
 * Card art (R2, REDESIGN.md §3): the Scryfall art-crop resolver the OG
 * images have used since P2.6, refactored out of src/lib/og/scryfall.ts so
 * the builder's ambient layer, the share page and (R5b) the hub banners
 * resolve art the one way, plus the shared nullable `CardArt` descriptor
 * all of them render from.
 *
 * Source of truth is the Scryfall API by PRINTING id — never a derived CDN
 * URL — because the artist credit lives only there (LATER row 49: no
 * artist column; the lean-row rule). X5's chosen picture is the one
 * reconciled exception: it captures the artist from this API once, at Save,
 * and stores it beside the printing id (src/lib/profile/avatar.ts), so a
 * render — the header is a client island on every page — derives the crop
 * from the printing id with no API call; the derived URL is the API's
 * `image_uris.art_crop` minus its `?` stamp (proven in X5's ship note).
 * Two consequences worth stating:
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
 *
 * When Scryfall says stop (the 2026-10-30 security audit's art-lookup
 * record): its rate-limit page says a 429 limits access for 30 seconds and
 * that continued overload can bring a temporary or permanent ban of the
 * application, and the nightly ingest sends this same User-Agent. So a 429
 * or a 403 opens a hold on this process for Retry-After, 60 seconds at the
 * least: until it ends, a lookup reads the data cache and makes no call. The
 * read is `fetch` with a signal that has already aborted, under a
 * `revalidate` no entry can outlive. Next answers an entry from its cache
 * before the signal matters, and the long `revalidate` means none reads as
 * stale, so none starts a background refresh (those drop the signal). A
 * printing with no entry rejects without touching the network. If a future
 * Next checks the signal first, warm printings go artless during a hold too,
 * which is still no call. Limits: a hold is per process, and Next runs a stale
 * entry's refresh after answering, so a 429 on that refresh opens nothing;
 * the first cold lookup to meet the 429 does.
 */
import type { GameAdapter } from "@/lib/games/types";

export const SCRYFALL_USER_AGENT = "Deckwarden/1.0 (https://deckwarden.gg)";
export const SCRYFALL_REVALIDATE_S = 86400;

const HOLD_MIN_S = 60;
const HOLD_MAX_S = 3600;
const HOLD_READ_REVALIDATE_S = 10 * 365 * 86400;

/** On globalThis like the database handle: one process may hold several copies of this module. */
const processState = globalThis as unknown as { __deckwardenScryfallHoldUntilMs?: number };

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
 * Why a lookup has no art (X5): `"no-art"` — Scryfall answered and the
 * printing has no crop or no artist (or Scryfall does not know it: a 404);
 * `"unreachable"` — any other non-OK answer, the fetch threw, or a hold
 * stopped the call. The first is an answer about the printing and the second
 * says nothing about it, so a caller that keeps its response must not keep
 * the second (lookupCardArt, lookupOgArt). The picture route words the two
 * differently.
 */
export type ArtLookup = { meta: ScryfallArtMeta } | { reason: "no-art" | "unreachable" };

/** A status-only line for the logs, and the hold when the status says stop. */
function noteRefusal(res: Response): void {
  console.error(`[art] api.scryfall.com answered ${res.status}`);
  if (res.status !== 429 && res.status !== 403) return;
  const retryAfter = Number(res.headers.get("retry-after"));
  const holdS = Number.isFinite(retryAfter)
    ? Math.min(Math.max(retryAfter, HOLD_MIN_S), HOLD_MAX_S)
    : HOLD_MIN_S;
  processState.__deckwardenScryfallHoldUntilMs = Date.now() + holdS * 1000;
}

/**
 * Art crop + artist for a printing, from the Scryfall API, with the reason
 * when there is none. Double-faced cards use the FRONT face
 * (`card_faces[0]`) — a per-face choice is not a feature anyone has asked
 * for. A missing crop OR artist is no art (the attribution rule).
 */
export async function lookupScryfallArtMeta(printingId: string): Promise<ArtLookup> {
  const holding = Date.now() < (processState.__deckwardenScryfallHoldUntilMs ?? 0);
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${printingId}`, {
      headers: { "User-Agent": SCRYFALL_USER_AGENT, Accept: "application/json" },
      ...(holding
        ? { next: { revalidate: HOLD_READ_REVALIDATE_S }, signal: AbortSignal.abort() }
        : { next: { revalidate: SCRYFALL_REVALIDATE_S } }),
    });
    if (!res.ok) {
      if (res.status === 404) return { reason: "no-art" };
      noteRefusal(res);
      return { reason: "unreachable" };
    }
    const card = (await res.json()) as ScryfallArtCard;
    const face = card.card_faces?.[0];
    const artCropUrl = card.image_uris?.art_crop ?? face?.image_uris?.art_crop;
    const artist = card.artist ?? face?.artist;
    if (!artCropUrl || !artist) return { reason: "no-art" };
    return { meta: { artCropUrl, artist } };
  } catch (err) {
    if (!holding) {
      console.error(
        `[art] api.scryfall.com unreachable: ${err instanceof Error ? err.name : typeof err}`,
      );
    }
    return { reason: "unreachable" };
  }
}

/**
 * The same lookup as a nullable — what the OG images, the hub banners, the
 * art endpoint and the editor's ambient layer read: any reason is null, and
 * callers degrade to their artless rendering, never to a 500.
 */
export async function fetchScryfallArtMeta(printingId: string): Promise<ScryfallArtMeta | null> {
  const lookup = await lookupScryfallArtMeta(printingId);
  return "meta" in lookup ? lookup.meta : null;
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
 * `full_card`, and no resolver exists for it. `transient` is true when the
 * lookup failed (ArtLookup's "unreachable"): the endpoint must not let the
 * CDN keep that null for a day.
 */
export async function lookupCardArt(
  adapter: Pick<GameAdapter, "capabilities">,
  printingId: string,
): Promise<{ art: CardArt | null; transient: boolean }> {
  if (ambientArtKind(adapter) !== "art_crop") return { art: null, transient: false };
  const lookup = await lookupScryfallArtMeta(printingId);
  return "meta" in lookup
    ? { art: artCropCardArt(lookup.meta), transient: false }
    : { art: null, transient: lookup.reason === "unreachable" };
}

/** The same decision as a nullable — what a render with nothing to keep or refuse reads. */
export async function resolveCardArt(
  adapter: Pick<GameAdapter, "capabilities">,
  printingId: string,
): Promise<CardArt | null> {
  return (await lookupCardArt(adapter, printingId)).art;
}
