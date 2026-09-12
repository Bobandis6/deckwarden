"use client";

/**
 * Sample-hand widget (P2.7): draw 7, mulligan, redraw — pure client state
 * over the deck list both surfaces already hold (share page + editor), zero
 * server round-trips. Nothing renders until the visitor asks for a hand, so
 * the widget adds no image fetches (or hydration-hostile randomness) to plain
 * share-page views. Mulligan is a full redraw of 7 with a counter — London
 * bottoming is the goldfish playtester's job (LATER.md), not this widget's.
 *
 * Images: the small CDN rendition through CardImage (R1b — lazy, sized; the
 * CDN and attribution rules live in its docblock). R3 wraps the section in a
 * labelled Collapsible (open by default — the Draw button is the content;
 * state not persisted).
 *
 * R6 (F4, REDESIGN.md §4 "Dealt hands"): the hand is DEALT — each card
 * enters with a stagger (`animation-delay` climbing per slot, the whole
 * deal under 400 ms, `fill-mode-backwards` so a card is invisible until its
 * turn, every class `motion-safe:`; under reduced motion no delay is
 * written and the cards simply appear) — and the controls read as a game
 * prompt: "Keep this hand?" with **Keep** and **Mulligan**. The state
 * machine is `none → dealt → kept`: Keep freezes the hand and says so in
 * the live region (no game state beyond that — no draw-next, LATER's
 * goldfish row stays); Mulligan redraws seven and counts; "New hand" (from
 * a kept hand) restarts at zero mulligans. Every deal bumps a nonce that
 * keys the list, so a new hand or a mulligan replays the deal. The draw
 * itself (`drawHand` / `buildLibrary`) is untouched.
 */
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { CardImage } from "@/components/cards/card-image";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toSmallImage } from "@/lib/cards/images";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { buildLibrary, drawHand } from "@/lib/decks/sample-hand";
import type { FormatDef } from "@/lib/games/types";
import { prefersReducedMotion } from "@/lib/theme/motion";

/** Per-slot delay of the deal; the last of seven cards starts at 180 ms. */
export const DEAL_STAGGER_MS = 30;
/** Each card's own entrance; the whole seven-card deal ends at 380 ms (≤ 400, §1). */
export const DEAL_CARD_MS = 200;
/** The dealt card's entrance classes — motion-safe only, backwards-filled so it waits for its delay. */
export const DEAL_CARD_MOTION_CLASS =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards motion-safe:duration-200";

type Phase = "none" | "dealt" | "kept";

export function SampleHand({
  entries,
  cards,
  format,
  onPreview,
}: {
  entries: EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  format: FormatDef;
  onPreview?: (card: EditorCard) => void;
}) {
  const library = useMemo(() => buildLibrary(entries, format), [entries, format]);
  const [hand, setHand] = useState<string[] | null>(null);
  const [mulligans, setMulligans] = useState(0);
  const [phase, setPhase] = useState<Phase>("none");
  // The deal nonce keys the list so every deal remounts it and the stagger
  // replays; `staggered` is the reduced-motion read taken AT the deal (an
  // event handler, never render), so a reduced-motion reader gets no delay.
  const [deal, setDeal] = useState(0);
  const [staggered, setStaggered] = useState(false);

  if (library.length === 0) return null;

  const draw = (mullCount: number) => {
    setHand(drawHand(library, format.openingHandSize));
    setMulligans(mullCount);
    setPhase("dealt");
    setDeal((n) => n + 1);
    setStaggered(!prefersReducedMotion());
  };

  const mulliganNote =
    mulligans > 0 ? `after ${mulligans} mulligan${mulligans === 1 ? "" : "s"}` : "";
  const shortNote =
    hand !== null && hand.length < format.openingHandSize
      ? ` (only ${hand.length} cards in the library)`
      : "";
  const status =
    phase === "kept"
      ? `Hand kept${mulliganNote ? ` ${mulliganNote}` : ""}.${shortNote}`
      : phase === "dealt"
        ? `${mulliganNote ? `After ${mulligans} mulligan${mulligans === 1 ? "" : "s"}` : ""}${shortNote}`
        : "";

  return (
    <Collapsible defaultOpen className="mt-6" render={<section />}>
      <h2 className="border-b pb-1">
        <CollapsibleTrigger className="group/trigger text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded text-xs font-medium tracking-wide uppercase hover:underline pointer-coarse:min-h-11">
          Sample hand
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 motion-safe:transition-transform motion-safe:duration-150 group-data-panel-open/trigger:rotate-180"
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>
        <div className="mt-2 flex flex-wrap items-center gap-2" data-phase={phase}>
          {phase === "none" && (
            <Button variant="outline" size="sm" onClick={() => draw(0)}>
              Draw sample hand
            </Button>
          )}
          {phase === "dealt" && (
            <span
              role="group"
              aria-label="Keep this hand?"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-sm font-medium">Keep this hand?</span>
              <Button size="sm" onClick={() => setPhase("kept")}>
                Keep
              </Button>
              <Button variant="outline" size="sm" onClick={() => draw(mulligans + 1)}>
                Mulligan
              </Button>
            </span>
          )}
          {phase === "kept" && (
            <Button variant="outline" size="sm" onClick={() => draw(0)}>
              New hand
            </Button>
          )}
          <span
            aria-live="polite"
            data-slot="hand-status"
            className="text-muted-foreground text-xs tabular-nums"
          >
            {status}
          </span>
        </div>
        {hand !== null && (
          <ul
            key={deal}
            data-slot="dealt-hand"
            data-kept={phase === "kept" || undefined}
            className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7"
          >
            {hand.map((cardId, i) => {
              const card = cards.get(cardId);
              if (!card) return null;
              const face = (
                <CardImage
                  src={card.image ? toSmallImage(card.image) : null}
                  alt={card.name}
                  title={card.name}
                  width={146}
                  height={204}
                  className="w-full rounded-[4.75%/3.5%] text-[0.65rem] shadow-sm"
                />
              );
              return (
                // Duplicates (30 Islands) are legal hands — key must include the slot.
                <li
                  key={`${cardId}-${i}`}
                  className={DEAL_CARD_MOTION_CLASS}
                  style={staggered ? { animationDelay: `${i * DEAL_STAGGER_MS}ms` } : undefined}
                >
                  {onPreview ? (
                    <button
                      type="button"
                      onClick={() => onPreview(card)}
                      className="block w-full cursor-pointer"
                      aria-label={card.name}
                    >
                      {face}
                    </button>
                  ) : (
                    face
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
