"use client";

/**
 * Sample-hand widget (P2.7): draw 7, mulligan, redraw — pure client state
 * over the deck list both surfaces already hold (share page + editor), zero
 * server round-trips. Nothing renders until the visitor asks for a hand, so
 * the widget adds no image fetches (or hydration-hostile randomness) to plain
 * share-page views. Mulligan is a full redraw of 7 with a counter — London
 * bottoming is the goldfish playtester's job (LATER.md), not this widget's.
 *
 * Images: small-rendition Scryfall CDN via plain <img> (CLAUDE.md: Hobby's
 * optimizer quota; the full-card frame keeps the artist/© line visible).
 */
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { toSmallImage } from "@/lib/cards/images";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { buildLibrary, drawHand, HAND_SIZE } from "@/lib/decks/sample-hand";
import type { FormatDef } from "@/lib/games/types";

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

  if (library.length === 0) return null;

  const draw = (mullCount: number) => {
    setHand(drawHand(library));
    setMulligans(mullCount);
  };

  return (
    <section className="mt-6">
      <h2 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
        Sample hand
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hand === null ? (
          <Button variant="outline" size="sm" onClick={() => draw(0)}>
            Draw sample hand
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => draw(0)}>
              New hand
            </Button>
            <Button variant="outline" size="sm" onClick={() => draw(mulligans + 1)}>
              Mulligan
            </Button>
            <span aria-live="polite" className="text-muted-foreground text-xs tabular-nums">
              {mulligans > 0 && `After ${mulligans} mulligan${mulligans === 1 ? "" : "s"}`}
              {hand.length < HAND_SIZE && ` (only ${hand.length} cards in the library)`}
            </span>
          </>
        )}
      </div>
      {hand !== null && (
        <ul className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {hand.map((cardId, i) => {
            const card = cards.get(cardId);
            if (!card) return null;
            const face = card.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={toSmallImage(card.image)}
                alt={card.name}
                title={card.name}
                width={146}
                height={204}
                loading="lazy"
                className="w-full rounded-[4.75%/3.5%] shadow-sm"
              />
            ) : (
              <span className="bg-muted flex aspect-146/204 w-full items-center justify-center rounded-md p-1 text-center text-[0.65rem]">
                {card.name}
              </span>
            );
            return (
              // Duplicates (30 Islands) are legal hands — key must include the slot.
              <li key={`${cardId}-${i}`}>
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
    </section>
  );
}
