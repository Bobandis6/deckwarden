/**
 * Shared satori building blocks for the three OG image routes (P2.6): one
 * visual language — dark canvas, left text column, right art panel — so
 * deck, hub, and card unfurls read as one site.
 *
 * Satori rules honored throughout: every multi-child div declares
 * display:flex; only flexbox/absolute layout; default @vercel/og font
 * (Inter 400/700 — no other weights), twemoji for user emoji.
 */
import type { ReactNode } from "react";

import type { OgArt } from "@/lib/og/scryfall";

export const OG_SIZE = { width: 1200, height: 630 };

const BG = "#101215";
const FG = "#f4f4f5";
const MUTED = "#9f9fa9";
const ACCENT = "#8b5cf6";

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
        fontFamily: "Inter",
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
              backgroundImage: `linear-gradient(to right, ${BG} 0%, rgba(16,18,21,0.45) 30%, rgba(16,18,21,0) 60%)`,
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
 * artist + © visible whenever cropped art renders.
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
      {`Art: ${artist} · ™ & © Wizards of the Coast`}
    </div>
  );
}

/** Small uppercase label above the title ("Commander deck", …). */
export function OgKicker({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 22,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: ACCENT,
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
        fontWeight: 700,
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

/** Mana-curve histogram: 8 bottom-aligned bars labeled 0–7+. */
export function OgCurve({ buckets, label }: { buckets: number[]; label: string }) {
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
                backgroundColor: value > 0 ? ACCENT : "#2a2a33",
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
      <OgKicker>deckwarden.gg</OgKicker>
      <OgTitle>Build, analyze & share Commander decks</OgTitle>
      <OgSubtitle>Free, fast, and no account needed.</OgSubtitle>
    </div>
  );
}

/** Bottom row: site wordmark left, optional stat chips right. */
export function OgFooter({ stats }: { stats: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>deckwarden</div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: ACCENT }}>.gg</div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {stats.map((s) => (
          <div
            key={s}
            style={{
              display: "flex",
              fontSize: 21,
              color: "#d4d4d8",
              backgroundColor: "#1c1e24",
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
