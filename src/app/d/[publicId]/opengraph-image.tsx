/**
 * Deck OG image (P2.6): commander art + deck name + curve — the Discord
 * unfurl that carries the share loop.
 *
 * Caching intent: force-dynamic, the same privacy contract as the page —
 * a deck flipped private must stop unfurling its name/commander/curve on
 * the NEXT request, so no ISR of the rendered PNG. Unlisted decks render
 * fully (share links are the viral loop; unlisted means unlisted, not
 * secret content). Cost stays sane because the Scryfall art/artist fetches
 * inside are data-cached daily per printing (og/scryfall.ts), leaving one
 * lean DB read plus a satori render per unfurl.
 *
 * Private/unknown decks get the generic branded image — zero deck data in
 * the pixels, and a 200 so link previews look intentional, never broken.
 */
import { ImageResponse } from "next/og";

import { loadDeckOgData, loadDefaultPrintingId } from "@/lib/og/data";
import {
  OG_SIZE,
  OgCurve,
  OgFooter,
  OgFrame,
  OgGenericBody,
  OgKicker,
  OgSubtitle,
  OgTitle,
} from "@/lib/og/elements";
import { fetchOgArt } from "@/lib/og/scryfall";

export const dynamic = "force-dynamic";

export const alt = "Deck on Deckwarden";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const deck = await loadDeckOgData(publicId);

  if (!deck || deck.visibility === "private") {
    return new ImageResponse(
      <OgFrame art={null}>
        <OgGenericBody />
        <OgFooter stats={[]} />
      </OgFrame>,
      size,
    );
  }

  const printingId = deck.commanderId ? await loadDefaultPrintingId(deck.commanderId) : null;
  const art = printingId ? await fetchOgArt(printingId) : null;

  const stats = [`${deck.cardCount} cards`];
  if (deck.priceUsd !== null) stats.push(`$${Math.round(deck.priceUsd).toLocaleString("en-US")}`);
  const hasCurve = deck.curve.some((v) => v > 0);

  return new ImageResponse(
    <OgFrame art={art}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <OgKicker>Commander deck</OgKicker>
        <OgTitle>{deck.name}</OgTitle>
        {deck.commanderNames.length > 0 && (
          <OgSubtitle>{deck.commanderNames.join(" · ")}</OgSubtitle>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {hasCurve && <OgCurve buckets={deck.curve} label="Mana curve" />}
        <OgFooter stats={stats} />
      </div>
    </OgFrame>,
    size,
  );
}
