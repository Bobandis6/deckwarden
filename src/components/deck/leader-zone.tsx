"use client";

/**
 * Leader-zone section (P1.3): the command zone rendered distinctly — card
 * image(s) shown prominently at the top of the deck pane in both views. All
 * naming comes off the adapter/format (ZoneDef.label, display.leaderNoun);
 * nothing game-specific here. Shared with the P1.7 share pages: omit onRemove
 * for the read-only rendering (no remove button, no editing hint).
 *
 * R3: the caption carries the printed id (`display.idBadge`, C13 — the two
 * Enel leaders are told apart here too) and the stat line (C15 — Life, for
 * One Piece, rides `display.statLine`; Magic gets its P/T). The empty state
 * gains "Choose commander / leader" when `onChooseLeader` is set (the
 * editor's — it focuses search); the share page passes nothing and keeps
 * the plain EmptyState.
 *
 * R5b (F12): in the read-only shape (no `onRemove` — the share page) each
 * card carries a persistent ring in the game accent, so the leader reads
 * as the deck's anchor; a validation ring still wins. The ring sits
 * outside the frame by construction (a box-shadow), never over the
 * artist / © line inside it. No mount-time glow: the image loads lazily
 * after hydration, so a glow would fire on an empty frame. The caption
 * comes from the shared `leaderCaption` (the artwork header reads the
 * same helper).
 */
import { XIcon } from "lucide-react";
import { useId } from "react";

import { CardImage } from "@/components/cards/card-image";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { leaderCaption } from "@/lib/decks/leader-caption";
import type { ViewItem } from "@/lib/decks/view-model";
import type { GameAdapter, ZoneDef } from "@/lib/games/types";
import { cn } from "@/lib/utils";

interface LeaderZoneProps {
  zone: ZoneDef;
  items: ViewItem<EditorEntry, EditorCard>[];
  /** Worst validation severity per card id (P1.4). */
  severity: ReadonlyMap<string, "error" | "warning">;
  /** Absent = read-only (share pages). */
  onRemove?: (zoneId: string, cardId: string) => void;
  onPreview: (card: EditorCard) => void;
  /** Editor only: the empty state's "Choose {leader}" action (focuses search). */
  onChooseLeader?: () => void;
  /** For the caption's id badge and stat line; absent = name only. */
  adapter?: GameAdapter;
}

export function LeaderZone({
  zone,
  items,
  severity,
  onRemove,
  onPreview,
  onChooseLeader,
  adapter,
}: LeaderZoneProps) {
  const noun = zone.label.toLowerCase();
  const readOnly = !onRemove;
  // R6 (status never color-only): the validation ring's severity as text,
  // described onto the card button — the name stays "Show {name}".
  const idPrefix = useId();
  return (
    <section className="mt-4">
      <h3 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
        {zone.label}
        <span className="ml-1.5 tabular-nums">{items.reduce((n, i) => n + i.entry.qty, 0)}</span>
      </h3>
      {items.length === 0 ? (
        <EmptyState
          className="mt-2 py-3"
          title={`No ${noun} yet`}
          hint={onRemove ? "Ctrl+Enter on a search result adds one." : undefined}
          action={
            onChooseLeader ? (
              <Button
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={onChooseLeader}
              >
                Choose {noun}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="mt-2 flex flex-wrap gap-3">
          {items.map(({ entry, card }) => {
            const caption = leaderCaption(adapter, card);
            const level = severity.get(card.id);
            const levelId = level ? `${idPrefix}-${entry.cardId}` : undefined;
            return (
              <li key={entry.cardId} className="w-40 max-w-[45%]">
                <button
                  type="button"
                  onClick={() => onPreview(card)}
                  aria-label={`Show ${card.name}`}
                  aria-describedby={levelId}
                  className={cn(
                    "focus-visible:ring-ring/50 block w-full rounded-[4.75%/3.5%] outline-none focus-visible:ring-3",
                    level === "error"
                      ? "ring-destructive ring-2"
                      : level === "warning"
                        ? "ring-2 ring-amber-500"
                        : readOnly && "ring-accent-game ring-2",
                  )}
                >
                  <CardImage
                    src={card.image}
                    alt={card.name}
                    width={488}
                    height={680}
                    frame
                    className="w-full text-xs shadow-md"
                  />
                </button>
                {level && (
                  <span id={levelId} data-slot="severity" className="sr-only">
                    {level === "error" ? "Has a problem" : "Warning"}
                  </span>
                )}
                <span className="mt-1 flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-xs">{card.name}</span>
                  {onRemove && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="pointer-coarse:size-11"
                      aria-label={`Remove ${card.name}`}
                      onClick={() => onRemove(entry.zone, entry.cardId)}
                    >
                      <XIcon />
                    </Button>
                  )}
                </span>
                {caption && (
                  <span
                    data-slot="leader-caption"
                    className="text-muted-foreground block truncate font-mono text-[0.65rem]"
                  >
                    {caption}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
