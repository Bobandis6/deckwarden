"use client";

/**
 * Leader-zone section (P1.3): the command zone rendered distinctly — card
 * image(s) shown prominently at the top of the deck pane in both views. All
 * naming comes off the adapter/format (ZoneDef.label, display.leaderNoun);
 * nothing game-specific here. Shared with the P1.7 share pages: omit onRemove
 * for the read-only rendering (no remove button, no editing hint).
 */
import { Button } from "@/components/ui/button";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { ViewItem } from "@/lib/decks/view-model";
import type { ZoneDef } from "@/lib/games/types";

interface LeaderZoneProps {
  zone: ZoneDef;
  items: ViewItem<EditorEntry, EditorCard>[];
  /** Worst validation severity per card id (P1.4). */
  severity: ReadonlyMap<string, "error" | "warning">;
  /** Absent = read-only (share pages). */
  onRemove?: (zoneId: string, cardId: string) => void;
  onPreview: (card: EditorCard) => void;
}

export function LeaderZone({ zone, items, severity, onRemove, onPreview }: LeaderZoneProps) {
  return (
    <section className="mt-4">
      <h3 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
        {zone.label}
        <span className="ml-1.5 tabular-nums">{items.reduce((n, i) => n + i.entry.qty, 0)}</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-1.5 text-xs">
          No {zone.label.toLowerCase()} yet
          {onRemove ? " — Ctrl+Enter on a search result adds one." : "."}
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-3">
          {items.map(({ entry, card }) => (
            <li key={entry.cardId} className="w-40 max-w-[45%]">
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
                    className="w-full rounded-[4.75%/3.5%] shadow-md"
                  />
                ) : (
                  <span className="bg-muted flex aspect-488/680 w-full items-center justify-center rounded-xl p-2 text-center text-xs">
                    {card.name}
                  </span>
                )}
              </button>
              <span className="mt-1 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-xs">{card.name}</span>
                {onRemove && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${card.name}`}
                    onClick={() => onRemove(entry.zone, entry.cardId)}
                  >
                    ×
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
