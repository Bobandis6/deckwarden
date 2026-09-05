/**
 * OP leader hub OG image (P4.4): name + external key + colors/life, artless
 * on purpose — the deliberate call from the card OG (P4.1) extends here:
 * never hotlink Bandai art into OG images while the permission posture is
 * unanswered; the R2 mirror serves PAGES, unfurls stay text-only. The frame
 * matches the site OG family, so the unfurl is branded, never half-rendered.
 *
 * Caching intent: ISR, revalidate daily — leader data changes at nightly
 * ingest; 142 leaders render lazily on first unfurl.
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

export const revalidate = 86400;

export const alt = "One Piece leader hub on Deckwarden";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const leader = await loadLeaderBySlug(GAME_ID.optcg, slug);

  if (!leader) {
    return new ImageResponse(
      <OgFrame art={null}>
        <OgGenericBody />
        <OgFooter stats={[]} />
      </OgFrame>,
      size,
    );
  }

  const attrs = leader.attrs as OptcgAttrs;
  const colors = maskToOptcgColorNames(leader.colorsMask).join("/");
  const subtitle = [colors, attrs.life != null ? `${attrs.life} Life` : null]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    <OgFrame art={null}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <OgKicker>One Piece Leader</OgKicker>
        <OgTitle>{leader.name}</OgTitle>
        <OgSubtitle>{`${leader.externalKey}${subtitle ? ` · ${subtitle}` : ""}`}</OgSubtitle>
      </div>
      <OgFooter stats={["Leader profile · deck building"]} />
    </OgFrame>,
    size,
  );
}
