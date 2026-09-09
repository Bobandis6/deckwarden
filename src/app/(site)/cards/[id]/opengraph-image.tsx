/**
 * Card page OG image (P2.6): art + name + type line.
 *
 * Caching intent: ISR, revalidate daily — card names/art/types change only
 * at nightly ingest, matching the card sitemap. ~35k cards render lazily
 * on first unfurl, never in bulk.
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
import { fetchOgArt } from "@/lib/og/scryfall";
import { ogAccent } from "@/lib/theme/tokens";

export const revalidate = 86400;

// ISR needs this (LATER row 69, fired in R1b): `revalidate` alone renders on
// every request — Next treats a dynamic route as ISR only when
// generateStaticParams exists, and an empty array means "nothing at build
// time, everything on first request, then cached for `revalidate`". Looks
// unused; do not delete.
export function generateStaticParams() {
  return [];
}

export const alt = "Card on Deckwarden";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await loadCardOgData(id);

  if (!card) {
    return new ImageResponse(
      <OgFrame art={null}>
        <OgGenericBody />
        <OgFooter stats={[]} />
      </OgFrame>,
      size,
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
  return new ImageResponse(
    <OgFrame art={art}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <OgKicker accent={accent}>{kicker}</OgKicker>
        <OgTitle>{card.name}</OgTitle>
        {card.typeLine && <OgSubtitle>{card.typeLine}</OgSubtitle>}
      </div>
      <OgFooter
        stats={[isMtg ? "Printings · prices · legality" : "Card text · printings · legality"]}
        accent={accent}
      />
    </OgFrame>,
    size,
  );
}
