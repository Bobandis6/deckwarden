"use client";

/**
 * Image-grid view (P1.3): default-printing card images off the Scryfall CDN
 * (plain <img>, unoptimized by design — CLAUDE.md; full card frame so the
 * artist/© line is never cropped), a quantity badge overlay, click → detail
 * pane. Same precomputed groups as the text view.
 */
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGroup } from "@/lib/decks/view-model";

interface DeckGridViewProps {
  groups: DeckGroup<EditorEntry, EditorCard>[];
  /** Worst validation severity per card id (P1.4) — drives the card rings. */
  severity: ReadonlyMap<string, "error" | "warning">;
  onPreview: (card: EditorCard) => void;
}

export function DeckGridView({ groups, severity, onPreview }: DeckGridViewProps) {
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
                  {card.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.image}
                      alt={card.name}
                      width={488}
                      height={680}
                      loading="lazy"
                      decoding="async"
                      className="w-full rounded-[4.75%/3.5%] shadow-sm"
                    />
                  ) : (
                    <span className="bg-muted flex aspect-488/680 w-full items-center justify-center rounded-xl p-2 text-center text-xs">
                      {card.name}
                    </span>
                  )}
                </button>
                <span
                  aria-label={`${entry.qty} in deck`}
                  className="bg-background/85 pointer-events-none absolute top-1 right-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums shadow-sm"
                >
                  ×{entry.qty}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
