/**
 * Card page OG image (P2.6): art + name + type line.
 *
 * Caching intent: dynamic, kept by Vercel's CDN for a day and served stale
 * for another while one re-renders (`OG_CDN_CACHE_CONTROL`) — card names,
 * art and types change only at nightly ingest. Not ISR since 2026-10-18
 * (the ISR write budget): a Magic card's preview stored ~1 MB, ~127 of
 * Hobby's 200K monthly ISR write units per render, and every deployment
 * starts its own empty ISR cache; CDN cache writes are free. A JPEG since
 * the same day (src/lib/og/jpeg.ts: ~1 MB → ~80 KB). The Scryfall fetches
 * inside keep their own daily data cache (explicit `next.revalidate`).
 */
import { ImageResponse } from "next/og";

import { GAME_ID } from "@/db/seed-data";
import { loadCardOgData, loadDefaultPrintingId } from "@/lib/og/data";
import {
  OG_SIZE,
  OgFooter,
  OgFrame,
  OgGenericBody,
  OgKicker,
  OgSubtitle,
  OgTitle,
} from "@/lib/og/elements";
import { loadOgFonts } from "@/lib/og/fonts";
import { jpegPreview, OG_CDN_CACHE_CONTROL } from "@/lib/og/jpeg";
import { fetchOgArt } from "@/lib/og/scryfall";
import { ogAccent } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

export const alt = "Card on Deckwarden";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Fonts on EVERY ImageResponse, fallback branches included (W2) — a
  // branch without them would repaint in the bundled sans mid-family.
  const [card, fonts] = await Promise.all([loadCardOgData(id), loadOgFonts()]);

  if (!card) {
    return jpegPreview(
      new ImageResponse(
        <OgFrame art={null}>
          <OgGenericBody />
          <OgFooter stats={[]} />
        </OgFrame>,
        { ...size, fonts },
      ),
      OG_CDN_CACHE_CONTROL,
    );
  }

  // fetchOgArt is Scryfall-only; other games' printing ids 404 there and the
  // unfurl renders artless — never hotlink Bandai art into OG images.
  const isMtg = card.gameId === GAME_ID.mtg;
  const printingId = isMtg ? await loadDefaultPrintingId(card.id) : null;
  const art = printingId ? await fetchOgArt(printingId) : null;
  const accent = ogAccent(card.gameId);

  const kicker = isMtg
    ? card.isLeaderCandidate
      ? "Commander"
      : "Magic card"
    : card.isLeaderCandidate
      ? "One Piece Leader"
      : "One Piece card";
  return jpegPreview(
    new ImageResponse(
      <OgFrame art={art}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <OgKicker accent={accent}>{kicker}</OgKicker>
          <OgTitle>{card.name}</OgTitle>
          {card.typeLine && <OgSubtitle>{card.typeLine}</OgSubtitle>}
        </div>
        <OgFooter
          stats={[isMtg ? "Printings, prices, legality" : "Card text, printings, legality"]}
          accent={accent}
        />
      </OgFrame>,
      { ...size, fonts },
    ),
    OG_CDN_CACHE_CONTROL,
  );
}
