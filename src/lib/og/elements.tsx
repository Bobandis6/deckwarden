/**
 * Shared satori building blocks for the three OG image routes (P2.6): one
 * visual language — dark canvas, left text column, right art panel — so
 * deck, hub, and card unfurls read as one site.
 *
 * Satori rules honored throughout: every multi-child div declares
 * display:flex; only flexbox/absolute layout; twemoji for user emoji.
 * Fonts (W2): the routes pass `loadOgFonts()` — Geist 400 for body (the
 * same bytes as @vercel/og's bundled default) and Literata 600 for the
 * title and the footer wordmark. `fontFamily: "Geist"` here still matches
 * the bundled default (registered "geist", matched case-insensitively)
 * when the routes pass no fonts, so the no-fonts fallback stays whole.
 */
import type { ReactNode } from "react";

import { artCredit } from "@/lib/cards/art";
import type { OgArt } from "@/lib/og/scryfall";
import { og, rgba } from "@/lib/theme/tokens";

export const OG_SIZE = { width: 1200, height: 630 };

// One token source (R1a): the canvas is the site's dark theme, so unfurls and
// the product read as one thing. The accent is per surface — the game accent
// where the page has a game, the brand gold elsewhere (W2) — passed
// explicitly because satori renders no React context.
const BG = og.bg;
const FG = og.fg;
const MUTED = og.muted;

/** Root canvas: text column on the left, optional art panel on the right. */
export function OgFrame({ art, children }: { art: OgArt | null; children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: BG,
        color: FG,
        fontFamily: "Geist",
        position: "relative",
      }}
    >
      {art && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 560,
            height: 630,
            display: "flex",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- satori element, not DOM */}
          <img
            src={art.dataUri}
            width={560}
            height={630}
            style={{ objectFit: "cover", width: 560, height: 630 }}
            alt=""
          />
          {/* Blend the art into the text column. */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 560,
              height: 630,
              display: "flex",
              backgroundImage: `linear-gradient(to right, ${BG} 0%, ${rgba(BG, 0.45)} 30%, ${rgba(BG, 0)} 60%)`,
            }}
          />
          <OgAttribution artist={art.artist} />
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: art ? 640 : 1200,
          height: 630,
          padding: "56px 48px 44px 56px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The attribution line the art_crop hard rule requires INSIDE the image:
 * artist + © visible whenever cropped art renders — the same `artCredit`
 * string the ambient layer's chip shows (R2), built in one place.
 */
function OgAttribution({ artist }: { artist: string }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 20,
        bottom: 16,
        display: "flex",
        padding: "6px 12px",
        borderRadius: 8,
        backgroundColor: "rgba(16,18,21,0.72)",
        color: "#d4d4d8",
        fontSize: 17,
      }}
    >
      {artCredit(artist)}
    </div>
  );
}

/** Small uppercase label above the title ("Commander deck", …), in the surface's accent. */
export function OgKicker({
  children,
  accent = og.accentGeneric,
}: {
  children: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 22,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: accent,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

export function OgTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        marginTop: 14,
        fontSize: 58,
        // The serif voice (W2, D0 "titles are serif"): Literata 600 — the
        // one weight loadOgFonts() ships — matching the site's h1s.
        fontFamily: "Literata",
        fontWeight: 600,
        lineHeight: 1.12,
        lineClamp: 2,
      }}
    >
      {children}
    </div>
  );
}

export function OgSubtitle({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        marginTop: 12,
        fontSize: 27,
        color: MUTED,
        lineClamp: 2,
        lineHeight: 1.3,
      }}
    >
      {children}
    </div>
  );
}

/** Mana-curve histogram: 8 bottom-aligned bars labeled 0–7+, filled in the accent. */
export function OgCurve({
  buckets,
  label,
  accent = og.accentGeneric,
}: {
  buckets: number[];
  label: string;
  accent?: string;
}) {
  const max = Math.max(...buckets, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
      <div style={{ display: "flex", fontSize: 19, color: MUTED, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        {buckets.map((value, mv) => (
          <div
            key={mv}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
          >
            <div
              style={{
                display: "flex",
                width: 40,
                height: Math.max(4, Math.round((value / max) * 110)),
                backgroundColor: value > 0 ? accent : og.raised,
                borderRadius: 5,
              }}
            />
            <div style={{ display: "flex", fontSize: 17, color: MUTED }}>
              {mv === 7 ? "7+" : String(mv)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Body for unknown/private subjects: brand + tagline, zero data. Deck OG
 * uses it so a private deck's unfurl looks intentional, not broken.
 */
export function OgGenericBody() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <OgKicker accent={og.accentGeneric}>deckwarden.gg</OgKicker>
      <OgTitle>Build, analyze & share Commander decks</OgTitle>
      <OgSubtitle>Free, fast, and no account needed.</OgSubtitle>
    </div>
  );
}

/**
 * The crest as a data-URI <img> for satori (W2): the same geometry and
 * literal colors as BrandMark's crest variant (edit them together). A data
 * URI because satori fetches no relative URLs — the pattern OgFrame already
 * uses for art (`art.dataUri`); ~700 bytes, no byte-budget concern.
 */
const CREST_SVG =
  '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none">' +
  '<g fill="#23483c" stroke="#ba9b61" stroke-width="3" stroke-linejoin="round">' +
  '<rect x="8.9" y="8.65" width="41" height="57.3" rx="3" transform="rotate(-20 29.4 37.3)"/>' +
  '<rect x="46.1" y="8.65" width="41" height="57.3" rx="3" transform="rotate(20 66.6 37.3)"/>' +
  '<rect x="27.5" y="1.5" width="41" height="57.3" rx="3"/></g>' +
  '<path d="M48 27.5C56.5 33.5 66.5 37.8 77.5 40.7V54C77.5 71 66.5 84 48 95C29.5 84 18.5 71 18.5 54V40.7C29.5 37.8 39.5 33.5 48 27.5Z" fill="#242c2f" stroke="#ba9b61" stroke-width="3" stroke-linejoin="round"/>' +
  '<g fill="#ba9b61"><path d="M48 34.5l2.8 3.4-2.8 3.4-2.8-3.4Z"/>' +
  '<rect x="46.6" y="40.8" width="2.8" height="8.7"/>' +
  '<path d="M38 49.5c6.5-2.2 13.5-2.2 20 0l-1 3.2c-5.8-1.8-12.2-1.8-18 0Z"/>' +
  '<path d="M45.4 52.5h5.2V80L48 87.5 45.4 80Z"/></g></svg>';

const CREST_DATA_URI = `data:image/svg+xml,${encodeURIComponent(CREST_SVG)}`;

/**
 * Bottom row: the brand lockup left — small crest + "Deckwarden" in Literata
 * with ".gg" in the surface accent (W2, D0) — optional stat chips right.
 */
export function OgFooter({
  stats,
  accent = og.accentGeneric,
}: {
  stats: string[];
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- satori element, not DOM */}
        <img src={CREST_DATA_URI} width={38} height={38} alt="" />
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ display: "flex", fontSize: 30, fontFamily: "Literata", fontWeight: 600 }}>
            Deckwarden
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontFamily: "Literata",
              fontWeight: 600,
              color: accent,
            }}
          >
            .gg
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {stats.map((s) => (
          <div
            key={s}
            style={{
              display: "flex",
              fontSize: 21,
              color: "#d4d4d8",
              backgroundColor: og.panel,
              padding: "8px 16px",
              borderRadius: 999,
            }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
