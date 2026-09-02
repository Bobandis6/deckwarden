"use client";

/**
 * Text view (P1.3): the deck's non-leader entries as grouped rows — per-group
 * counts in the header, cost pips per row, and the P1.2 quantity steppers and
 * remove buttons preserved. Groups/sorting come precomputed from the pure
 * view-model layer; this component only renders. Shared with the P1.7 share
 * pages: omit onSetQty/onRemove for the read-only rendering (static counts,
 * no remove button).
 */
import { CostPips } from "@/components/deck/cost-pips";
import { Button } from "@/components/ui/button";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGroup } from "@/lib/decks/view-model";
import type { GameAdapter } from "@/lib/games/types";

interface DeckTextViewProps {
  adapter: GameAdapter;
  groups: DeckGroup<EditorEntry, EditorCard>[];
  /** Worst validation severity per card id (P1.4) — drives the inline dots. */
  severity: ReadonlyMap<string, "error" | "warning">;
  /** Absent = read-only (share pages): no steppers. */
  onSetQty?: (zoneId: string, cardId: string, qty: number) => void;
  /** Absent = read-only (share pages): no remove button. */
  onRemove?: (zoneId: string, cardId: string) => void;
  onPreview: (card: EditorCard) => void;
  /** Card ids the viewer owns any printing of (P3.7); absent = no collection, no marks. */
  owned?: ReadonlySet<string>;
}

export function DeckTextView({
  adapter,
  groups,
  severity,
  onSetQty,
  onRemove,
  onPreview,
  owned,
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
                {onSetQty ? (
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
                ) : (
                  <span className="w-6 shrink-0 text-center text-xs tabular-nums">{entry.qty}</span>
                )}
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
                  {/* Owned mark (P3.7): inside the truncating name button, so it
                      never shifts the row's steppers or pips. */}
                  {owned?.has(card.id) && (
                    <span
                      role="img"
                      aria-label="In your collection"
                      title="In your collection"
                      className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400"
                    >
                      ✓
                    </span>
                  )}
                </button>
                <CostPips html={adapter.display.costHtml(card)} className="shrink-0 text-xs" />
                {onRemove && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${card.name}`}
                    className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                    onClick={() => onRemove(entry.zone, entry.cardId)}
                  >
                    ×
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
