"use client";

/**
 * CardImage (R1b, C2 + G2): the one card-image element, replacing the eight
 * raw <img> sites. Always sized (explicit width/height, so the box is
 * reserved before load and nothing shifts), lazy and async-decoded unless
 * `priority` (the hub heroes and the card page — eager, high fetch
 * priority, no fade: the LCP image should not wait on hydration), fading in
 * on load, with `frame` opting into the G2 treatment: card radius, the game
 * accent as a ring on hover, a 2 px lift. Motion is `motion-safe:` only.
 * Keyboard focus belongs to the interactive parent (the buttons and links
 * around these images already draw --ring, the game accent on data-game
 * surfaces), so the frame draws no focus ring of its own.
 *
 * Attribution (CLAUDE.md): sources are the Scryfall CDN (Magic) and
 * Deckwarden's R2 mirror of Bandai's card list (One Piece), hotlinked and
 * unoptimized by design — Vercel Hobby's image quota dies on 100-card
 * grids. Every rendition rendered here is the FULL card, so the artist/©
 * line in the frame is always in the pixels; art_crop never goes through
 * this component (it needs artist + © visible nearby — the OG images handle
 * that on their own). Bandai's own hosts refuse cross-site embeds, which is
 * why callers pass null (→ the fallback) instead of a URL browsers refuse.
 *
 * `src` null renders the caller's `fallback` (the card name, or the
 * smoke-pinned "Card image coming soon") in a box of the same aspect ratio.
 */
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface CardImageProps {
  src: string | null;
  alt: string;
  width: number;
  height: number;
  className?: string;
  /** Above the fold: eager, fetchpriority=high, visible at once (no fade). */
  priority?: boolean;
  /** The G2 frame: card radius, accent ring on hover, 2 px lift (motion-safe). */
  frame?: boolean;
  /** Shown in an aspect box when there is no embeddable src; defaults to `alt`. */
  fallback?: ReactNode;
  title?: string;
}

const FRAME_CLASS =
  "rounded-[4.75%/3.5%] ring-accent-game hover:ring-2 motion-safe:hover:-translate-y-0.5";

export function CardImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  frame = false,
  fallback,
  title,
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);

  if (!src) {
    return (
      <span
        className={cn(
          "bg-muted text-muted-foreground flex items-center justify-center p-2 text-center text-sm",
          frame && "rounded-[4.75%/3.5%]",
          className,
        )}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {fallback ?? alt}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- CDN hotlink by design (docblock).
    <img
      src={src}
      alt={alt}
      title={title}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "auto" : "async"}
      fetchPriority={priority ? "high" : undefined}
      onLoad={priority ? undefined : () => setLoaded(true)}
      onError={priority ? undefined : () => setLoaded(true)}
      // A cached image can finish before hydration attaches onLoad; `complete`
      // with real pixels behind it means the fade already has something to show.
      ref={
        priority
          ? undefined
          : (el) => {
              if (el?.complete && el.naturalWidth > 0) setLoaded(true);
            }
      }
      className={cn(
        "motion-safe:[transition:opacity_250ms,transform_150ms,box-shadow_150ms]",
        !priority && (loaded ? "opacity-100" : "opacity-0"),
        frame && FRAME_CLASS,
        className,
      )}
    />
  );
}
