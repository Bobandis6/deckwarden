/**
 * Commander hub OG image (P2.6): leader art + name + staples curve, with
 * honest shelf counts as footer chips.
 *
 * Caching intent: ISR, revalidate daily — hub data shifts once nightly at
 * ingest, matching the hub sitemap. (The page itself revalidates hourly;
 * the unfurl can lag a few hours without anyone noticing.)
 */
import { ImageResponse } from "next/og";

import { GAME_ID } from "@/db/seed-data";
import { loadCombosForCard } from "@/lib/combos/queries";
import { staplesCurveBlock } from "@/lib/hub/curve";
import { loadDefaultPrinting, loadLeaderBySlug, loadStaples } from "@/lib/hub/queries";
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

export const revalidate = 86400;

export const alt = "Commander hub on Deckwarden";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const leader = await loadLeaderBySlug(GAME_ID.mtg, slug);

  if (!leader) {
    return new ImageResponse(
      <OgFrame art={null}>
        <OgGenericBody />
        <OgFooter stats={[]} />
      </OgFrame>,
      size,
    );
  }

  const [printing, staples, combosData] = await Promise.all([
    loadDefaultPrinting(leader.id),
    loadStaples(leader),
    loadCombosForCard(leader.id, { fitCiMask: leader.ciMask }),
  ]);
  const art = printing ? await fetchOgArt(printing.id) : null;
  const curveBlock = staplesCurveBlock(staples);

  // Cold-start honesty: chips only for shelves that actually have rows.
  const stats: string[] = [];
  if (staples.length > 0) stats.push(`${staples.length} staples`);
  if (combosData.total > 0) {
    stats.push(`${combosData.total} ${combosData.total === 1 ? "combo" : "combos"}`);
  }

  return new ImageResponse(
    <OgFrame art={art}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <OgKicker>Commander hub</OgKicker>
        <OgTitle>{leader.name}</OgTitle>
        <OgSubtitle>Staples, curve, budget picks & combos</OgSubtitle>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {curveBlock?.kind === "histogram" && (
          <OgCurve buckets={curveBlock.buckets.map((b) => b.value)} label="Curve of staples" />
        )}
        <OgFooter stats={stats} />
      </div>
    </OgFrame>,
    size,
  );
}
