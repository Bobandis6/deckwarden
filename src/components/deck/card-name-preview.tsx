"use client";

/**
 * CardNamePreview (R5b, F5): the hover-and-focus card preview on card
 * names in share pages — Base UI PreviewCard through `ui/hover-card.tsx`,
 * wired here for the first time. The trigger is the caller's OWN element
 * (the text view's name button, the validation panel's chip) passed
 * through `render`, so its tag, classes and click handler are unchanged: a
 * click still navigates to the card page exactly as before, and the
 * preview is a layer on top. Opens on hover after a short delay and on
 * keyboard focus (the primitive's `useFocus` is visible-focus only, so a
 * tap never opens it — nothing gets stuck open on touch); closes on leave,
 * blur and Escape (the primitive's defaults).
 *
 * The popup is the card's normal rendition — the wire's `card.image`, so
 * no request of its own; One Piece names preview the r2.dev normal image
 * the share page's grid already renders — through `CardImage` at an
 * explicit size, `alt=""` with the name as screen-reader text beside it (a
 * card image shows nothing the name does not say). A card without an
 * embeddable image previews the name in the frame box (honest, not
 * broken). The editor never renders this: its detail pane already
 * previews (§4 F5 — share pages only).
 */
import type { ReactElement } from "react";

import { CardImage } from "@/components/cards/card-image";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { EditorCard } from "@/lib/decks/editor-state";

/** Hover opens after this; the primitive's default (600 ms) reads as a stall on a decklist. */
export const PREVIEW_OPEN_DELAY_MS = 300;
/** Leaving closes after this; short, so scanning down a list never leaves a stale card up. */
export const PREVIEW_CLOSE_DELAY_MS = 150;

export function CardNamePreview({
  card,
  children,
}: {
  card: EditorCard;
  /** The trigger element itself — rendered as is, with the preview's handlers merged in. */
  children: ReactElement;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={PREVIEW_OPEN_DELAY_MS}
        closeDelay={PREVIEW_CLOSE_DELAY_MS}
        render={children}
      />
      <HoverCardContent side="right" align="start" className="w-auto p-1.5">
        <CardImage
          src={card.image}
          alt=""
          width={488}
          height={680}
          className="w-56 rounded-[4.75%/3.5%]"
          fallback={card.name}
        />
        <span className="sr-only">{card.name}</span>
      </HoverCardContent>
    </HoverCard>
  );
}
