"use client";

/**
 * AmbientArt (R2, REDESIGN.md §3): the faint leader artwork — or the
 * color-identity gradient — behind the builder's three panes and the share
 * page's main column. Rendered as the LAST child of a `relative isolate`
 * surface root: the layer itself is absolute, under everything (`-z-10`),
 * `aria-hidden` and inert to the pointer, so dialogs, menus and toasts
 * (portaled, z-50) sit above it and nothing here is reachable by keyboard.
 *
 * What paints, in order of preference: the crop at about 8 % opacity in
 * dark and 4 % in light (`opacity-[0.04] dark:opacity-[0.08]` — the theme
 * class on <html> decides, no JavaScript) under a gradient veil; else the
 * radial gradient from the deck's swatches at the SAME opacity policy, so
 * both games carry equal weight; else nothing (no leader). The gradient is
 * the fallback for every artless state — no art declared, art missing, the
 * image failed, or Background art Off — so turning art Off keeps the
 * gradient (§3 lists the preference under fallbacks).
 *
 * Crossfade: the previous crop lingers for 250 ms (`animate-out fade-out`,
 * `fill-mode-forwards`) while the replacement plays `animate-in fade-in` —
 * a CSS animation rather than a transition so a cached image still fades
 * in when its class lands in the same frame as its mount. The builder
 * hands over crops that are already decoded (use-leader-art.ts); the share
 * page's server-resolved crop loads in place and stays invisible (with the
 * gradient up) until `load`, or for good on `error`. Reduced motion drops
 * the previous crop at once; everything is `motion-safe:` besides.
 *
 * Attribution (CLAUDE.md hard rule): whenever a crop is on screen the
 * credit chip is too — the same component, no exceptions — as a sticky
 * zero-height row at the surface's end, so it rides the viewport's bottom
 * edge while the art does and rests above the footer when the surface
 * scrolls past. Bottom-LEFT, because the toast viewport owns bottom-right
 * on `sm+`. `appearance` null (before hydration) renders nothing at all:
 * an Off reader never sees a flash.
 */
import { useEffect, useState } from "react";

import type { CardArt } from "@/lib/cards/art";
import { ambientGradient } from "@/lib/decks/ambient-art";
import type { Appearance } from "@/lib/theme/appearance";
import { cn } from "@/lib/utils";

/** The one opacity policy for crops and gradients alike. */
const AMBIENT_OPACITY = "opacity-[0.04] dark:opacity-[0.08]";

/** The previous crop is dropped once its fade-out (250 ms) has played. */
const CROSSFADE_MS = 300;

const IMAGE_CLASS = "absolute inset-0 h-full w-full object-cover";

// The gradient lives with the pure helpers (R5a: the deck tiles paint it
// server-side, where a "use client" export would be a client reference).
export { ambientGradient };

interface Shown {
  current: CardArt | null;
  previous: CardArt | null;
}

export function AmbientArt({
  art,
  swatches,
  appearance,
}: {
  /** The resolved crop, or null for every artless state. */
  art: CardArt | null;
  /** The deck's color swatches (adapter `display.colorSwatches`); null = no leader. */
  swatches: readonly string[] | null;
  /** The reader's preference; null until hydration. */
  appearance: Appearance | null;
}) {
  const wanted = appearance?.backgroundArt ? art : null;
  // Previous-render pattern: a change of crop keeps the old one for its
  // fade-out; no refs during render.
  const [shown, setShown] = useState<Shown>({ current: wanted, previous: null });
  if (shown.current?.url !== wanted?.url) {
    setShown({ current: wanted, previous: shown.current });
  }
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!shown.previous) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(
      () => setShown((state) => ({ ...state, previous: null })),
      reduced ? 0 : CROSSFADE_MS,
    );
    return () => clearTimeout(timer);
  }, [shown.previous]);

  if (appearance === null) return null;
  const hasLeader = swatches !== null && swatches.length > 0;
  const current = shown.current && shown.current.url !== failedUrl ? shown.current : null;
  const artOnScreen = current !== null && loadedUrl === current.url;
  if (!hasLeader && !current && !shown.previous) return null;

  return (
    <>
      <div
        aria-hidden
        data-slot="ambient-art"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        {hasLeader && (
          <div
            data-slot="ambient-gradient"
            className={cn(
              "absolute inset-0 motion-safe:transition-opacity motion-safe:duration-250",
              artOnScreen ? "opacity-0" : AMBIENT_OPACITY,
            )}
            style={{ backgroundImage: ambientGradient(swatches) }}
          />
        )}
        {shown.previous && shown.previous.url !== current?.url && (
          // eslint-disable-next-line @next/next/no-img-element -- Scryfall CDN hotlink by design (CLAUDE.md image rule).
          <img
            key={shown.previous.url}
            src={shown.previous.url}
            alt=""
            decoding="async"
            fetchPriority="low"
            data-slot="ambient-crop"
            data-leaving="true"
            className={cn(
              IMAGE_CLASS,
              AMBIENT_OPACITY,
              "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:duration-250 motion-safe:fill-mode-forwards motion-reduce:opacity-0",
            )}
          />
        )}
        {current && (
          // eslint-disable-next-line @next/next/no-img-element -- Scryfall CDN hotlink by design (CLAUDE.md image rule).
          <img
            key={current.url}
            src={current.url}
            alt=""
            decoding="async"
            fetchPriority="low"
            data-slot="ambient-crop"
            data-loaded={artOnScreen ? "true" : "false"}
            onLoad={() => setLoadedUrl(current.url)}
            onError={() => setFailedUrl(current.url)}
            // A cached (or pre-decoded) crop can finish before onLoad attaches.
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setLoadedUrl(current.url);
            }}
            className={cn(
              IMAGE_CLASS,
              artOnScreen
                ? `${AMBIENT_OPACITY} motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-250`
                : "opacity-0",
            )}
          />
        )}
        {artOnScreen && (
          <div
            data-slot="ambient-veil"
            className="from-background/70 via-background/30 to-background/90 absolute inset-0 bg-linear-to-b"
          />
        )}
      </div>
      {artOnScreen && (
        <div className="pointer-events-none sticky bottom-0 z-20 h-0">
          <p
            data-slot="art-credit"
            className="text-muted-foreground bg-background/80 absolute bottom-2 left-3 rounded-md px-1.5 py-0.5 text-[0.65rem] leading-4 whitespace-nowrap"
          >
            {current.credit}
          </p>
        </div>
      )}
    </>
  );
}
