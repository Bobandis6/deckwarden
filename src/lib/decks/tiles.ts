/**
 * Deck tiles (R5a — REDESIGN.md §2 "Deck collections", G5 + G8): the pure
 * row → tile step every deck collection shares — the home rail and Continue
 * building, the /c/ deck shelf, /account, and the guest list fed by
 * POST /api/decks/mine. No IO: callers resolve the first leader's default
 * printing (joined or batched) and hand it in.
 *
 * Images: the leader image is the `small` full-card rendition through
 * `thumbnailUrl`, which answers null for everything but the Scryfall CDN —
 * so a One Piece tile makes no image request until LATER row 51 flips
 * `img.deckwarden.gg` on. Its slot paints the deck's color gradient instead
 * (R2's `ambientGradient` over `display.colorSwatches`), so a One Piece tile
 * is never a grey box and the flip only swaps the slot's contents.
 *
 * The identity strip (G8): a 3 px `background` built here from
 * `decks.ci_mask` — the adapter's swatches in the game's display order
 * (WUBRG for Magic, Bandai's for One Piece), partner identities already OR'd
 * into the mask by leaderDenorm, mask 0 → the game's neutral swatch —
 * rendered inline on a server element, so it reads before any image loads.
 */
import type { DeckVisibility } from "@/db/schema";
import { findFormatById, gameCodeById } from "@/db/seed-data";
import { embeddablePrintingImageUrl, thumbnailUrl } from "@/lib/cards/images";
import { ambientGradient } from "@/lib/decks/ambient-art";
import { updatedLabel } from "@/lib/decks/display";
import { getAdapter } from "@/lib/games/registry";

/** The two games with adapters today (GameId also names azuki, which has none). */
export type TileGame = "mtg" | "optcg";

/** Short game names for the tile chip — the header's long names would wrap a tile. */
export const TILE_GAME_LABELS: Record<TileGame, string> = { mtg: "Magic", optcg: "One Piece" };

/** The `small` rendition's pixels — the box every tile and shelf reserves. */
export const TILE_IMAGE = { width: 146, height: 204 } as const;

/** Neutral paint for a deck whose game has no adapter (nothing to derive colors from). */
const NEUTRAL_SWATCH = "var(--border)";

export interface DeckTileData {
  href: string;
  name: string;
  game: TileGame | null;
  /** The game chip ("Magic" / "One Piece"); "" hides the chip. */
  gameLabel: string;
  formatLabel: string;
  /** Owner surfaces only; null = not shown. */
  visibility: DeckVisibility | null;
  /** UTC-pinned ("Sep 9"), so server and client agree. */
  updatedLabel: string;
  /** Rendered as `♥ N` only when > 0. */
  likesCount: number;
  ciMask: number;
  /** The `small` rendition, or null when the game's images are gated or the deck has no leader. */
  leaderImage: string | null;
  /** The identity strip's CSS background. */
  strip: string;
  /** The image slot's paint when `leaderImage` is null. */
  slotGradient: string;
  /** Byline text (the author's display name) only when they chose a username. */
  author: string | null;
}

export interface DeckTileInput {
  href: string;
  name: string;
  /** Game code from the wire (`deckMetaJson.game`) or `gameCodeById`; unknown → no chip, neutral strip. */
  game: string | null;
  formatCode: string | null;
  visibility?: DeckVisibility | null;
  updatedAt: Date | string;
  likesCount: number;
  ciMask: number;
  leaderImage: string | null;
  author?: { name: string | null; username: string | null } | null;
}

/** The adapter's swatches for a deck's identity; the neutral swatch without an adapter. */
export function tileSwatches(game: TileGame | null, ciMask: number): string[] {
  const swatches = game ? getAdapter(game).display.colorSwatches?.(ciMask) : undefined;
  return swatches && swatches.length > 0 ? swatches : [NEUTRAL_SWATCH];
}

/** Equal hard-stop segments in the swatches' order — one color is just that color. */
export function stripBackground(swatches: readonly string[]): string {
  if (swatches.length <= 1) return swatches[0] ?? NEUTRAL_SWATCH;
  const n = swatches.length;
  const pct = (i: number) => `${Math.round((i / n) * 10000) / 100}%`;
  const stops = swatches.map((color, i) => `${color} ${pct(i)} ${pct(i + 1)}`).join(", ");
  return `linear-gradient(to right, ${stops})`;
}

/**
 * The tile image for a default printing: the `small` rendition of the
 * embeddable URL, null when the URL is not Scryfall's (the One Piece
 * mirror — the LATER row 51 gate) or when there is no printing.
 */
export function leaderTileImage(
  printing: { id: string; imageOverride?: unknown } | null | undefined,
): string | null {
  if (!printing) return null;
  return thumbnailUrl(embeddablePrintingImageUrl(printing, "normal"));
}

function formatLabelByCode(game: TileGame | null, code: string | null): string {
  if (!code) return "";
  if (!game) return code;
  return getAdapter(game).formats.find((f) => f.code === code)?.label ?? code;
}

/** Finished tile data from either the wire shape or a database row's fields. */
export function deckTileData(input: DeckTileInput): DeckTileData {
  const game: TileGame | null = input.game === "mtg" || input.game === "optcg" ? input.game : null;
  const swatches = tileSwatches(game, input.ciMask);
  return {
    href: input.href,
    name: input.name,
    game,
    gameLabel: game ? TILE_GAME_LABELS[game] : "",
    formatLabel: formatLabelByCode(game, input.formatCode),
    visibility: input.visibility ?? null,
    updatedLabel: updatedLabel(new Date(input.updatedAt)),
    likesCount: input.likesCount,
    ciMask: input.ciMask,
    leaderImage: input.leaderImage,
    strip: stripBackground(swatches),
    slotGradient: ambientGradient(swatches),
    author: input.author?.username ? (input.author.name ?? input.author.username) : null,
  };
}

/** A deck as the collection queries and /account select it (author columns only where joined). */
export interface TileDeckRow {
  publicId: string;
  name: string;
  gameId: number;
  formatId: number;
  visibility: DeckVisibility;
  ciMask: number;
  likesCount: number;
  updatedAt: Date;
  authorName?: string | null;
  authorUsername?: string | null;
}

/** Row → tile data; `printing` is the first leader's default printing or null; `byline: false` on owner surfaces. */
export function tileFromDeck(
  deck: TileDeckRow,
  printing: { id: string; imageOverride?: unknown } | null,
  opts: { href: string; showVisibility?: boolean; byline?: boolean },
): DeckTileData {
  return deckTileData({
    href: opts.href,
    name: deck.name,
    game: gameCodeById(deck.gameId) ?? null,
    formatCode: findFormatById(deck.formatId)?.code ?? null,
    visibility: opts.showVisibility ? deck.visibility : null,
    updatedAt: deck.updatedAt,
    likesCount: deck.likesCount,
    ciMask: deck.ciMask,
    leaderImage: leaderTileImage(printing),
    author:
      opts.byline === false || deck.authorUsername === undefined
        ? null
        : { name: deck.authorName ?? null, username: deck.authorUsername },
  });
}

/** The joined default-printing columns of a collection row, as the image helpers take them. */
export function rowPrinting(row: {
  printingId: string | null;
  imageOverride?: unknown;
}): { id: string; imageOverride?: unknown } | null {
  return row.printingId ? { id: row.printingId, imageOverride: row.imageOverride } : null;
}
