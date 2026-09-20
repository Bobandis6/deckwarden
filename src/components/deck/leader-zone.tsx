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
 * One Piece, rides `display.statLine`; Magic gets its P/T). W4 (D3) rebuilds
 * the editor's empty state: the primary action is a Browse LINK to the
 * adapter's leader index (`display.leaderBrowse`; `onBrowseLeader` writes
 * the saved-deck pick intent before navigation) and the old search focus
 * demotes to a ghost "Search by name" (`onChooseLeader`, unchanged
 * callback); the share page passes neither and keeps the plain EmptyState.
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
import { ArrowRightIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { CardImage } from "@/components/cards/card-image";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
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
  /** Editor only: the empty state's ghost "Search by name" action (focuses search). */
  onChooseLeader?: () => void;
  /**
   * Editor only (W4): fired when the primary "Browse commanders / leaders"
   * link is clicked, BEFORE navigation — the editor writes the pick intent
   * for saved decks there (drafts keep plain navigation). The destination
   * itself comes off `adapter.display.leaderBrowse`.
   */
  onBrowseLeader?: () => void;
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
  onBrowseLeader,
  adapter,
}: LeaderZoneProps) {
  const noun = zone.label.toLowerCase();
  const readOnly = !onRemove;
  const browse = adapter?.display.leaderBrowse;
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
          hint={
            onRemove
              ? "Pick one from the full list, or press Ctrl+Enter on a search result."
              : undefined
          }
          action={
            // W4 (D3): Browse is the primary path — a styled Link, not a
            // Button (the account-slot pattern) — and search focus demotes
            // to a ghost "Search by name". Both stack full-width on phones.
            onChooseLeader ? (
              <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                {browse && (
                  <Link
                    href={browse.href}
                    onClick={onBrowseLeader}
                    className={cn(buttonVariants({ size: "sm" }), "pointer-coarse:min-h-11")}
                  >
                    {browse.label}
                    <ArrowRightIcon aria-hidden className="size-4" />
                  </Link>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={onChooseLeader}
                >
                  Search by name
                </Button>
              </div>
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
