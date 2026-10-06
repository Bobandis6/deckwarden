"use client";

/**
 * "At the table" (Y5, WAVE4 D6): the card right under the share page's
 * bracket line — what a pod should know before the game, built from the
 * read and the owner's own words (src/lib/brackets/table.ts). The
 * adapter's evidence rows first, each naming its source (Wizards' list,
 * Commander Spellbook, Scryfall Tagger), then what the owner said: How it
 * plays, the read's questions they answered, the table's exceptions. A row
 * the owner said nothing for is absent, never "none".
 *
 * Card names carry the share page's hover / focus preview
 * (CardNamePreview, D0) on a button that opens the card's page, like the
 * text view's names. Quiet by design — muted labels, no color, no badge:
 * a bracket is not a problem.
 */
import { useId } from "react";

import { CardNamePreview } from "@/components/deck/card-name-preview";
import { BRACKET_COPY } from "@/lib/brackets/copy";
import { itemSeparator, type TableLine } from "@/lib/brackets/table";
import type { EditorCard } from "@/lib/decks/editor-state";

export function AtTheTable({
  lines,
  cards,
  onPreview,
}: {
  lines: readonly TableLine[];
  cards: ReadonlyMap<string, EditorCard>;
  onPreview: (card: EditorCard) => void;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-slot="at-the-table"
      className="mt-3 rounded-lg border px-3 py-2"
    >
      <h2
        id={headingId}
        className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
      >
        {BRACKET_COPY.atTheTable}
      </h2>
      <dl className="mt-1.5 space-y-1 text-xs">
        {lines.map((line) => (
          <div key={line.id} data-line={line.id} className="break-words">
            <dt className="text-muted-foreground inline">{line.label}:</dt>{" "}
            <dd className="inline">
              {line.items.length === 0
                ? line.text
                : line.items.map((item, i) => (
                    <span key={item.join("+")}>
                      {i > 0 && itemSeparator(line, cards)}
                      {item.map((id, j) => (
                        <span key={id}>
                          {j > 0 && " + "}
                          <CardName card={cards.get(id)} onPreview={onPreview} />
                        </span>
                      ))}
                    </span>
                  ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CardName({
  card,
  onPreview,
}: {
  card: EditorCard | undefined;
  onPreview: (card: EditorCard) => void;
}) {
  if (!card) return null;
  return (
    <CardNamePreview name={card.name} image={card.image}>
      <button
        type="button"
        onClick={() => onPreview(card)}
        className="cursor-pointer underline-offset-2 hover:underline"
      >
        {card.name}
      </button>
    </CardNamePreview>
  );
}
