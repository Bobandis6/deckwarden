"use client";

/**
 * Text view (P1.3): the deck's non-leader entries as grouped rows — per-group
 * counts in the header, cost pips per row, and the P1.2 quantity steppers and
 * remove buttons preserved. Groups/sorting come precomputed from the pure
 * view-model layer; this component only renders.
 */
import { CostPips } from "@/components/editor/cost-pips";
import { Button } from "@/components/ui/button";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGroup } from "@/lib/decks/view-model";
import type { GameAdapter } from "@/lib/games/types";

interface DeckTextViewProps {
  adapter: GameAdapter;
  groups: DeckGroup<EditorEntry, EditorCard>[];
  /** Worst validation severity per card id (P1.4) — drives the inline dots. */
  severity: ReadonlyMap<string, "error" | "warning">;
  onSetQty: (zoneId: string, cardId: string, qty: number) => void;
  onRemove: (zoneId: string, cardId: string) => void;
  onPreview: (card: EditorCard) => void;
}

export function DeckTextView({
  adapter,
  groups,
  severity,
  onSetQty,
  onRemove,
  onPreview,
}: DeckTextViewProps) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="mt-4">
          <h3 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
            {group.label}
            <span className="ml-1.5 tabular-nums">{group.qty}</span>
          </h3>
          <ul className="mt-1">
            {group.items.map(({ entry, card }) => (
              <li
                key={`${entry.zone}:${entry.cardId}`}
                className="group/row hover:bg-muted/60 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm"
              >
                <span className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`One fewer ${card.name}`}
                    onClick={() => onSetQty(entry.zone, entry.cardId, entry.qty - 1)}
                  >
                    −
                  </Button>
                  <span className="w-6 text-center text-xs tabular-nums">{entry.qty}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`One more ${card.name}`}
                    onClick={() => onSetQty(entry.zone, entry.cardId, entry.qty + 1)}
                  >
                    +
                  </Button>
                </span>
                <button
                  type="button"
                  onClick={() => onPreview(card)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left hover:underline"
                >
                  {severity.has(card.id) && (
                    <span
                      aria-label={severity.get(card.id) === "error" ? "Has a problem" : "Warning"}
                      className={`size-1.5 shrink-0 rounded-full ${
                        severity.get(card.id) === "error" ? "bg-destructive" : "bg-amber-500"
                      }`}
                    />
                  )}
                  <span className="truncate">{card.name}</span>
                </button>
                <CostPips html={adapter.display.costHtml(card)} className="shrink-0 text-xs" />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${card.name}`}
                  className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                  onClick={() => onRemove(entry.zone, entry.cardId)}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
