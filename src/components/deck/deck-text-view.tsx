"use client";

/**
 * Text view (P1.3): the deck's non-leader entries as grouped rows — per-group
 * counts in the header, cost pips per row, and the P1.2 quantity steppers and
 * remove buttons preserved. Groups/sorting come precomputed from the pure
 * view-model layer; this component only renders. Shared with the P1.7 share
 * pages: omit onSetQty/onRemove for the read-only rendering (static counts,
 * no remove button).
 *
 * R3 (C12 / C13 / C15 / F3): the quantity is always visible while the
 * steppers and the remove button reveal on hover or focus-within (rows are
 * plain list items, so focus-within works here); cost pips sit in a fixed
 * right column so rows align whatever the cost; One Piece rows carry the
 * printed id and a muted mono "5000 · +1000" (`display.rowStats`); group
 * headers stick inside the editor's scrolling pane (`stickyHeaders` — the
 * share page scrolls the document and keeps them plain); and the one row
 * whose quantity just grew pops its badge (`pop`, keyed so it plays once).
 *
 * R5b (F5): `preview` wraps each name button in the share page's hover
 * and focus card preview — the button, its classes and its click stay as
 * they are; the editor passes nothing (its detail pane already previews).
 *
 * R4: on coarse pointers the EDITABLE rows (`onSetQty`) grow to 44 px and
 * the steppers and remove become 44 px and always visible — a finger has
 * no hover — while the pip column narrows to make room; mouse rows keep
 * today's density, and the read-only share page changes nothing.
 */
import { XIcon } from "lucide-react";

import { CardNamePreview } from "@/components/deck/card-name-preview";
import { CostPips } from "@/components/deck/cost-pips";
import { Button } from "@/components/ui/button";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGroup } from "@/lib/decks/view-model";
import type { GameAdapter } from "@/lib/games/types";
import { cn } from "@/lib/utils";

export const GROUP_HEADER_CLASS =
  "text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase";
/** Sticks to the top of the nearest scroll container (the editor's deck section on lg). */
export const STICKY_HEADER_CLASS = "bg-background sticky top-0 z-10";

/** Reveal-on-hover/focus for the per-row controls; the quantity itself never hides. On coarse pointers: always shown, 44 px. */
const REVEAL_CLASS =
  "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100";

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
  /** Editor: group headers stick to the top of the scrolling pane (C12). */
  stickyHeaders?: boolean;
  /** The row ("zone:cardId") whose quantity badge pops, with a nonce so each pop remounts (F3). */
  pop?: { key: string; nonce: number } | null;
  /** Share pages: hover / focus card previews on the name buttons (F5). */
  preview?: boolean;
}

export function DeckTextView({
  adapter,
  groups,
  severity,
  onSetQty,
  onRemove,
  onPreview,
  owned,
  stickyHeaders = false,
  pop = null,
  preview = false,
}: DeckTextViewProps) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="mt-4">
          <h3 className={cn(GROUP_HEADER_CLASS, stickyHeaders && STICKY_HEADER_CLASS)}>
            {group.label}
            <span className="ml-1.5 tabular-nums">{group.qty}</span>
          </h3>
          <ul className="mt-1">
            {group.items.map(({ entry, card }) => {
              const rowKey = `${entry.zone}:${entry.cardId}`;
              const popping = pop !== null && pop.key === rowKey;
              const badge = adapter.display.idBadge?.(card);
              const stats = adapter.display.rowStats?.(card);
              const nameButton = (
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
                      className="shrink-0 text-xs text-emerald-700 dark:text-emerald-400"
                    >
                      ✓
                    </span>
                  )}
                  {/* Printed id (C13) and the row stats (C15) — One Piece; Magic declares neither. */}
                  {badge && <span className="text-muted-foreground shrink-0 text-xs">{badge}</span>}
                  {stats && (
                    <span className="text-muted-foreground shrink-0 font-mono text-xs">
                      {stats}
                    </span>
                  )}
                </button>
              );
              return (
                <li
                  key={rowKey}
                  className={cn(
                    "group/row hover:bg-muted/60 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm",
                    onSetQty && "pointer-coarse:min-h-11",
                  )}
                >
                  {onSetQty ? (
                    <span className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`One fewer ${card.name}`}
                        className={REVEAL_CLASS}
                        onClick={() => onSetQty(entry.zone, entry.cardId, entry.qty - 1)}
                      >
                        −
                      </Button>
                      <span
                        key={popping ? pop.nonce : "qty"}
                        data-slot="qty"
                        className={cn(
                          "w-6 text-center text-xs tabular-nums",
                          popping &&
                            "motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200",
                        )}
                      >
                        {entry.qty}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`One more ${card.name}`}
                        className={REVEAL_CLASS}
                        onClick={() => onSetQty(entry.zone, entry.cardId, entry.qty + 1)}
                      >
                        +
                      </Button>
                    </span>
                  ) : (
                    <span data-slot="qty" className="w-6 shrink-0 text-center text-xs tabular-nums">
                      {entry.qty}
                    </span>
                  )}
                  {preview ? (
                    <CardNamePreview card={card}>{nameButton}</CardNamePreview>
                  ) : (
                    nameButton
                  )}
                  {/* Fixed pip column (C12): min-w-20 fits the fixtures' widest six-pip costs; a wider cost extends rather than wraps. */}
                  <span
                    data-slot="pips"
                    className={cn(
                      "inline-flex min-w-20 shrink-0 justify-end",
                      onSetQty && "pointer-coarse:min-w-12",
                    )}
                  >
                    <CostPips html={adapter.display.costHtml(card)} className="text-xs" />
                  </span>
                  {onRemove && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${card.name}`}
                      className={REVEAL_CLASS}
                      onClick={() => onRemove(entry.zone, entry.cardId)}
                    >
                      <XIcon />
                    </Button>
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
