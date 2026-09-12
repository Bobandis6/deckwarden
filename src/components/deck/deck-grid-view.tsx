"use client";

/**
 * Image-grid view (P1.3): default-printing card images through CardImage
 * (R1b — lazy, sized, framed; the CDN and attribution rules live in its
 * docblock), a quantity badge overlay, click → detail pane. Same precomputed
 * groups as the text view.
 *
 * R3 (C13): the printed id (`display.idBadge`) joins the owned badge in the
 * TOP-LEFT corner and the quantity stays top-right — top corners only, since
 * the frame's bottom carries the artist / © line (Magic) or Bandai's text
 * (One Piece). `stickyHeaders` mirrors the text view's editor-only sticky
 * group headers.
 *
 * R6 (status never color-only): a card with a validation issue carries the
 * severity as text — an sr-only "Has a problem" / "Warning" (the text
 * view's words) wired through `aria-describedby`, so the button's name
 * stays "Show {name}" and the ring's hue is no longer the only channel.
 */
import { useId } from "react";

import { CardImage } from "@/components/cards/card-image";
import { GROUP_HEADER_CLASS, STICKY_HEADER_CLASS } from "@/components/deck/deck-text-view";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGroup } from "@/lib/decks/view-model";
import type { GameAdapter } from "@/lib/games/types";
import { cn } from "@/lib/utils";

interface DeckGridViewProps {
  groups: DeckGroup<EditorEntry, EditorCard>[];
  /** Worst validation severity per card id (P1.4) — drives the card rings. */
  severity: ReadonlyMap<string, "error" | "warning">;
  onPreview: (card: EditorCard) => void;
  /** Card ids the viewer owns any printing of (P3.7); absent = no collection, no badges. */
  owned?: ReadonlySet<string>;
  /** For the printed-id badge (C13); absent = no id badges. */
  adapter?: GameAdapter;
  /** Editor: group headers stick to the top of the scrolling pane (C12). */
  stickyHeaders?: boolean;
}

const BADGE_CLASS =
  "bg-background/85 pointer-events-none rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums shadow-sm";

export function DeckGridView({
  groups,
  severity,
  onPreview,
  owned,
  adapter,
  stickyHeaders = false,
}: DeckGridViewProps) {
  const idPrefix = useId();
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="mt-4">
          <h3 className={cn(GROUP_HEADER_CLASS, stickyHeaders && STICKY_HEADER_CLASS)}>
            {group.label}
            <span className="ml-1.5 tabular-nums">{group.qty}</span>
          </h3>
          <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
            {group.items.map(({ entry, card }) => {
              const badge = adapter?.display.idBadge?.(card);
              const level = severity.get(card.id);
              const levelId = level ? `${idPrefix}-${entry.zone}-${card.id}` : undefined;
              return (
                <li key={`${entry.zone}:${entry.cardId}`} className="relative">
                  <button
                    type="button"
                    onClick={() => onPreview(card)}
                    aria-label={`Show ${card.name}`}
                    aria-describedby={levelId}
                    className={`focus-visible:ring-ring/50 block w-full rounded-[4.75%/3.5%] outline-none focus-visible:ring-3 ${
                      level === "error"
                        ? "ring-destructive ring-2"
                        : level === "warning"
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
                  {level && (
                    <span id={levelId} data-slot="severity" className="sr-only">
                      {level === "error" ? "Has a problem" : "Warning"}
                    </span>
                  )}
                  <span
                    aria-label={`${entry.qty} in deck`}
                    className={cn(BADGE_CLASS, "absolute top-1 right-1")}
                  >
                    ×{entry.qty}
                  </span>
                  {/* Top-left: the printed id, then the owned badge (P3.7). The
                      bottom of the frame is the artist/© line and stays uncovered (CLAUDE.md). */}
                  {(badge || owned?.has(card.id)) && (
                    <span className="pointer-events-none absolute top-1 left-1 flex max-w-[calc(100%-3.5rem)] gap-1">
                      {badge && <span className={cn(BADGE_CLASS, "truncate")}>{badge}</span>}
                      {owned?.has(card.id) && (
                        <span
                          aria-label="In your collection"
                          className={cn(BADGE_CLASS, "text-emerald-700 dark:text-emerald-400")}
                        >
                          ✓ Owned
                        </span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
