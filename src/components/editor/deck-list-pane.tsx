"use client";

/**
 * Deck list pane (P1.2): entries grouped by the format's zones with quantity
 * steppers and remove buttons; the running count tracks the format's deckSize.
 * Grouping/sorting toggles and richer views are P1.3 — this is the working
 * list the quick-add flow lands into.
 */
import { CostPips } from "@/components/editor/cost-pips";
import { Button } from "@/components/ui/button";
import {
  deckSizeCount,
  zoneQty,
  type EditorCard,
  type EditorEntry,
} from "@/lib/decks/editor-state";
import type { FormatDef, GameAdapter } from "@/lib/games/types";
import { useState } from "react";

interface DeckListPaneProps {
  adapter: GameAdapter;
  format: FormatDef;
  entries: EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  onSetQty: (zoneId: string, cardId: string, qty: number) => string | undefined;
  onRemove: (zoneId: string, cardId: string) => void;
  onPreview: (card: EditorCard) => void;
}

export function DeckListPane({
  adapter,
  format,
  entries,
  cards,
  onSetQty,
  onRemove,
  onPreview,
}: DeckListPaneProps) {
  const [error, setError] = useState<string | null>(null);
  const total = deckSizeCount(entries, format);
  const sizeLabel = format.deckSize.max !== null ? `${total} / ${format.deckSize.max}` : `${total}`;

  const setQtyChecked = (zoneId: string, cardId: string, qty: number) => {
    setError(onSetQty(zoneId, cardId, qty) ?? null);
  };

  return (
    <div className="p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Deck</h2>
        <span className="text-muted-foreground text-sm tabular-nums">{sizeLabel} cards</span>
      </div>
      {error && (
        <p aria-live="polite" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}

      {format.zones.map((zone) => {
        const zoneEntries = entries
          .filter((e) => e.zone === zone.id)
          .sort((a, b) =>
            (cards.get(a.cardId)?.name ?? "").localeCompare(cards.get(b.cardId)?.name ?? ""),
          );
        return (
          <section key={zone.id} className="mt-4">
            <h3 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
              {zone.label}
              <span className="ml-1.5 tabular-nums">{zoneQty(entries, zone.id)}</span>
            </h3>
            {zoneEntries.length === 0 ? (
              <p className="text-muted-foreground mt-1.5 text-xs">
                {zone.isLeaderZone
                  ? `No ${zone.label.toLowerCase()} yet — Ctrl+Enter on a search result adds one.`
                  : "No cards yet — search on the left and press Enter."}
              </p>
            ) : (
              <ul className="mt-1">
                {zoneEntries.map((entry) => {
                  const card = cards.get(entry.cardId);
                  if (!card) return null;
                  return (
                    <li
                      key={entry.cardId}
                      className="group/row hover:bg-muted/60 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm"
                    >
                      <span className="flex shrink-0 items-center">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`One fewer ${card.name}`}
                          onClick={() => setQtyChecked(entry.zone, entry.cardId, entry.qty - 1)}
                        >
                          −
                        </Button>
                        <span className="w-6 text-center text-xs tabular-nums">{entry.qty}</span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`One more ${card.name}`}
                          onClick={() => setQtyChecked(entry.zone, entry.cardId, entry.qty + 1)}
                        >
                          +
                        </Button>
                      </span>
                      <button
                        type="button"
                        onClick={() => onPreview(card)}
                        className="min-w-0 flex-1 truncate rounded px-1 text-left hover:underline"
                      >
                        {card.name}
                      </button>
                      <CostPips
                        html={adapter.display.costHtml(card)}
                        className="shrink-0 text-xs"
                      />
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
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
