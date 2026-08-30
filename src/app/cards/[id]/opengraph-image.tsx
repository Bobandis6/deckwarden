/**
 * Card page OG image (P2.6): art + name + type line.
 *
 * Caching intent: ISR, revalidate daily — card names/art/types change only
 * at nightly ingest, matching the card sitemap. ~35k cards render lazily
 * on first unfurl, never in bulk.
 */
import { ImageResponse } from "next/og";

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

export const revalidate = 86400;

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

  const printingId = await loadDefaultPrintingId(card.id);
  const art = printingId ? await fetchOgArt(printingId) : null;

  return new ImageResponse(
    <OgFrame art={art}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <OgKicker>{card.isLeaderCandidate ? "Commander" : "Magic card"}</OgKicker>
        <OgTitle>{card.name}</OgTitle>
        {card.typeLine && <OgSubtitle>{card.typeLine}</OgSubtitle>}
      </div>
      <OgFooter stats={["Printings · prices · legality"]} />
    </OgFrame>,
    size,
  );
}
