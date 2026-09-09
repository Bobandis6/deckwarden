"use client";

/**
 * Image-grid view (P1.3): default-printing card images through CardImage
 * (R1b — lazy, sized, framed; the CDN and attribution rules live in its
 * docblock), a quantity badge overlay, click → detail pane. Same precomputed
 * groups as the text view.
 */
import { CardImage } from "@/components/cards/card-image";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGroup } from "@/lib/decks/view-model";

interface DeckGridViewProps {
  groups: DeckGroup<EditorEntry, EditorCard>[];
  /** Worst validation severity per card id (P1.4) — drives the card rings. */
  severity: ReadonlyMap<string, "error" | "warning">;
  onPreview: (card: EditorCard) => void;
  /** Card ids the viewer owns any printing of (P3.7); absent = no collection, no badges. */
  owned?: ReadonlySet<string>;
}

export function DeckGridView({ groups, severity, onPreview, owned }: DeckGridViewProps) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="mt-4">
          <h3 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
            {group.label}
            <span className="ml-1.5 tabular-nums">{group.qty}</span>
          </h3>
          <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
            {group.items.map(({ entry, card }) => (
              <li key={`${entry.zone}:${entry.cardId}`} className="relative">
                <button
                  type="button"
                  onClick={() => onPreview(card)}
                  aria-label={`Show ${card.name}`}
                  className={`focus-visible:ring-ring/50 block w-full rounded-[4.75%/3.5%] outline-none focus-visible:ring-3 ${
                    severity.get(card.id) === "error"
                      ? "ring-destructive ring-2"
                      : severity.get(card.id) === "warning"
                        ? "ring-2 ring-amber-500"
                        : ""
                  }`}
                >
                  <CardImage
                    src={card.image}
                    alt={card.name}
                    width={488}
                    height={680}
                    frame
                    className="w-full text-xs shadow-sm"
                  />
                </button>
                <span
                  aria-label={`${entry.qty} in deck`}
                  className="bg-background/85 pointer-events-none absolute top-1 right-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums shadow-sm"
                >
                  ×{entry.qty}
                </span>
                {/* Owned badge (P3.7) sits top-left: the bottom of the frame is
                    the artist/© line, which stays uncovered (CLAUDE.md). */}
                {owned?.has(card.id) && (
                  <span
                    aria-label="In your collection"
                    className="bg-background/85 pointer-events-none absolute top-1 left-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-emerald-700 shadow-sm dark:text-emerald-400"
                  >
                    ✓ Owned
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
