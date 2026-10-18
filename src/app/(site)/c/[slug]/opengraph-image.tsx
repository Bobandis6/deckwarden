/**
 * Commander hub OG image (P2.6): leader art + name + staples curve, with
 * honest shelf counts as footer chips.
 *
 * Caching intent: dynamic, kept by Vercel's CDN for a day and served stale
 * for another while one re-renders (`OG_CDN_CACHE_CONTROL`) — hub data
 * shifts once nightly at ingest, matching the hub sitemap. (The page
 * itself revalidates hourly; the unfurl can lag a few hours without anyone
 * noticing.) Not ISR since 2026-10-18 (the ISR write budget): this preview
 * stored 0.7–1 MB, 89–127 of Hobby's 200K monthly ISR write units per
 * render (five renders were 28% of one 12-hour window's writes), and every
 * deployment starts its own empty ISR cache; CDN cache writes are free. A
 * JPEG since the same day (src/lib/og/jpeg.ts: ~1 MB → ~80 KB). The
 * Scryfall fetches inside keep their own daily data cache.
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
import { loadOgFonts } from "@/lib/og/fonts";
import { jpegPreview, OG_CDN_CACHE_CONTROL } from "@/lib/og/jpeg";
import { fetchOgArt } from "@/lib/og/scryfall";
import { ogAccent } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

export const alt = "Commander hub on Deckwarden";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Fonts on EVERY ImageResponse, fallback branches included (W2) — a
  // branch without them would repaint in the bundled sans mid-family.
  const [leader, fonts] = await Promise.all([loadLeaderBySlug(GAME_ID.mtg, slug), loadOgFonts()]);

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

  const [printing, staples, combosData] = await Promise.all([
    loadDefaultPrinting(leader.id),
    loadStaples(leader),
    loadCombosForCard(leader.id, { fitCiMask: leader.ciMask }),
  ]);
  const art = printing ? await fetchOgArt(printing.id) : null;
  const curveBlock = staplesCurveBlock(staples);
  const accent = ogAccent(GAME_ID.mtg);

  // Cold-start honesty: chips only for shelves that actually have rows.
  const stats: string[] = [];
  if (staples.length > 0) stats.push(`${staples.length} staples`);
  if (combosData.total > 0) {
    stats.push(`${combosData.total} ${combosData.total === 1 ? "combo" : "combos"}`);
  }

  return jpegPreview(
    new ImageResponse(
      <OgFrame art={art}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <OgKicker accent={accent}>Commander hub</OgKicker>
          <OgTitle>{leader.name}</OgTitle>
          <OgSubtitle>Staples, curve, budget picks & combos</OgSubtitle>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {curveBlock?.kind === "histogram" && (
            <OgCurve
              buckets={curveBlock.buckets.map((b) => b.value)}
              label="Curve of staples"
              accent={accent}
            />
          )}
          <OgFooter stats={stats} accent={accent} />
        </div>
      </OgFrame>,
      { ...size, fonts },
    ),
    OG_CDN_CACHE_CONTROL,
  );
}
