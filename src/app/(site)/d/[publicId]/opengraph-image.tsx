/**
 * Deck OG image (P2.6): commander art + deck name + curve — the Discord
 * unfurl that carries the share loop.
 *
 * Caching intent: force-dynamic, the same privacy contract as the page —
 * a deck flipped private must stop unfurling its name/commander/curve on
 * the NEXT request, so no ISR of the rendered image. Unlisted decks render
 * fully (share links are the viral loop; unlisted means unlisted, not
 * secret content). Cost stays sane because the Scryfall art/artist fetches
 * inside are data-cached daily per printing (og/scryfall.ts), leaving one
 * lean DB read plus a satori render per unfurl.
 *
 * Private/unknown decks get the generic branded image — zero deck data in
 * the pixels, and a 200 so link previews look intentional, never broken.
 *
 * A JPEG since 2026-10-18 (src/lib/og/jpeg.ts: the ~0.7 MB PNG re-encoded
 * at quality 80, an order of magnitude smaller per unfurl) under the same
 * header as before (`OG_UNCACHED_CACHE_CONTROL`, ImageResponse's own
 * production default): still never kept at the CDN.
 *
 * Rate-limited per address since S4 (SECURITY-AUDIT-report.md §7's S4
 * paragraph, `RATE_LIMITS.deckPreview`): a dynamic satori + sharp render
 * that no cache keeps was the cheapest way to spend the function-time
 * budget from one share link. The bucket is consumed before anything —
 * the generic image included — and the over-cap answer is the limiter's
 * own 429 with Retry-After, which an unfurl crawler backs off from; the
 * tag-revalidated cached render that would make the route cheap instead is
 * LATER.md's design note (an ISR write per render, the budget 847e999 left).
 */
import { headers } from "next/headers";
import { ImageResponse } from "next/og";

import { clientIp } from "@/lib/decks/access";
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
import { loadOgFonts } from "@/lib/og/fonts";
import { jpegPreview, OG_UNCACHED_CACHE_CONTROL } from "@/lib/og/jpeg";
import { deckOgLabels } from "@/lib/og/labels";
import { fetchOgArt } from "@/lib/og/scryfall";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const alt = "Deck on Deckwarden";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  // The address's bucket before any read or render (S4) — this is a route
  // handler, so the request's headers are in scope.
  const limited = await enforceRateLimit(RATE_LIMITS.deckPreview(clientIp(await headers())));
  if (limited) return limited;

  const { publicId } = await params;
  // Fonts on EVERY ImageResponse, fallback branches included (W2) — a
  // branch without them would repaint in the bundled sans mid-family.
  const [deck, fonts] = await Promise.all([loadDeckOgData(publicId), loadOgFonts()]);

  if (!deck || deck.visibility === "private") {
    return jpegPreview(
      new ImageResponse(
        <OgFrame art={null}>
          <OgGenericBody />
          <OgFooter stats={[]} />
        </OgFrame>,
        { ...size, fonts },
      ),
      OG_UNCACHED_CACHE_CONTROL,
    );
  }

  // Game-true vocabulary + art posture (P4.6): OP unfurls are artless by
  // design (labels.ts has the reasoning) and never touch the Scryfall API.
  const labels = deckOgLabels(deck.gameId);
  const printingId =
    labels.fetchArt && deck.commanderId ? await loadDefaultPrintingId(deck.commanderId) : null;
  const art = printingId ? await fetchOgArt(printingId) : null;

  const stats = [`${deck.cardCount} cards`];
  if (deck.priceUsd !== null) stats.push(`$${Math.round(deck.priceUsd).toLocaleString("en-US")}`);
  // Y5 (D6): the owner's declared target, never a computed read — a second
  // kicker line, not a third stat pill: beside the wordmark a third pill
  // reached the art credit's chip (measured on dev: "100 cards", "$148",
  // "Bracket 3 (declared)"), and one kicker line wrapped mid-phrase.
  const declared =
    deck.targetLevel !== null && labels.declared ? labels.declared(deck.targetLevel) : null;
  const hasCurve = deck.curve.some((v) => v > 0);

  return jpegPreview(
    new ImageResponse(
      <OgFrame art={art}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <OgKicker accent={labels.accent}>{labels.kicker}</OgKicker>
          {declared && <OgKicker accent={labels.accent}>{declared}</OgKicker>}
          <OgTitle>{deck.name}</OgTitle>
          {deck.commanderNames.length > 0 && (
            <OgSubtitle>{deck.commanderNames.join(" · ")}</OgSubtitle>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {hasCurve && (
            <OgCurve buckets={deck.curve} label={labels.curveLabel} accent={labels.accent} />
          )}
          <OgFooter stats={stats} accent={labels.accent} />
        </div>
      </OgFrame>,
      { ...size, fonts },
    ),
    OG_UNCACHED_CACHE_CONTROL,
  );
}
