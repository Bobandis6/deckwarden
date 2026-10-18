/**
 * OP leader hub OG image (P4.4): name + external key + colors/life, artless
 * on purpose — the deliberate call from the card OG (P4.1) extends here:
 * never hotlink Bandai art into OG images while the permission posture is
 * unanswered; the R2 mirror serves PAGES, unfurls stay text-only. The frame
 * matches the site OG family, so the unfurl is branded, never half-rendered.
 *
 * Caching intent: dynamic, kept by Vercel's CDN for a day and served stale
 * for another while one re-renders (`OG_CDN_CACHE_CONTROL`) — leader data
 * changes at nightly ingest. Not ISR since 2026-10-18 (the ISR write
 * budget, with the card and hub previews): ~6 of Hobby's 200K monthly ISR
 * write units per render, re-spent after every deployment; CDN cache
 * writes are free. A JPEG since the same day (src/lib/og/jpeg.ts).
 */
import { ImageResponse } from "next/og";

import { GAME_ID } from "@/db/seed-data";
import type { OptcgAttrs } from "@/lib/games/optcg/adapter";
import { maskToOptcgColorNames } from "@/lib/games/optcg/colors";
import { loadLeaderBySlug } from "@/lib/hub/queries";
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
import { ogAccent } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

export const alt = "One Piece leader hub on Deckwarden";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Fonts on EVERY ImageResponse, fallback branches included (W2) — a
  // branch without them would repaint in the bundled sans mid-family.
  const [leader, fonts] = await Promise.all([loadLeaderBySlug(GAME_ID.optcg, slug), loadOgFonts()]);

  if (!leader) {
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

  const attrs = leader.attrs as OptcgAttrs;
  const accent = ogAccent(GAME_ID.optcg);
  const colors = maskToOptcgColorNames(leader.colorsMask).join("/");
  const subtitle = [colors, attrs.life != null ? `${attrs.life} Life` : null]
    .filter(Boolean)
    .join(" · ");

  return jpegPreview(
    new ImageResponse(
      <OgFrame art={null}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <OgKicker accent={accent}>One Piece Leader</OgKicker>
          <OgTitle>{leader.name}</OgTitle>
          <OgSubtitle>{`${leader.externalKey}${subtitle ? ` · ${subtitle}` : ""}`}</OgSubtitle>
        </div>
        <OgFooter stats={["Leader profile · deck building"]} accent={accent} />
      </OgFrame>,
      { ...size, fonts },
    ),
    OG_CDN_CACHE_CONTROL,
  );
}
