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
 *
 * Y7b (WAVE4 D8): `onSwap` adds "Swap…" before the remove button — revealed
 * the same way, 44 px on touch — on each row `canSwap` accepts (the editor:
 * a main-list card the adapter offers alternatives for). A row it refuses (a
 * land) keeps a same-width spacer so the pip column stays aligned. The share
 * page passes neither, so no row there has one.
 *
 * U3a (WAVE5 D4, lines to space): a group heading is its label and its
 * count (`GroupHeading`) on space instead of a hairline; the quantity is
 * 14 px medium tabular, the name's size; the pips are 0.8em of a text-sm
 * column (11.2 px). The editor's groups skip layout and paint while off
 * screen (`content-visibility: auto`). U6 (WAVE5 D7) gave the share page
 * the same headings and rows; its `ruled` look (the hairline headings, the
 * 12 px quantity and pips) is gone.
 *
 * U3b (WAVE5 D4, the materials): a sticky heading has no backing of its own
 * at rest (U3a's 46 px band over the ambient art is gone) and becomes the
 * chrome material only while stuck, rows passing under it, with a 12 px
 * scroll-edge gradient over the rows below; under the fallbacks the solid
 * strip and the hairline instead. `useStuck` decides; it never runs on the
 * share page, which passes no `stickyHeaders`.
 *
 * U4a (WAVE5 D5, 44 px on touch): an editable row's name button stretches
 * to its row on a coarse pointer, so the name is a 44 px target like the
 * steppers; the row and the look are unchanged, and the share page's rows
 * (no `onSetQty`) keep theirs.
 */
import { ArrowLeftRightIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { CHROME_CLASS } from "@/components/chrome-material";
import { CardNamePreview } from "@/components/deck/card-name-preview";
import { CostPips } from "@/components/deck/cost-pips";
import { Button } from "@/components/ui/button";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGroup } from "@/lib/decks/view-model";
import type { GameAdapter } from "@/lib/games/types";
import { cn } from "@/lib/utils";

/** A list group's heading (U3a): the label beside its count, on space — no hairline, no section margin. */
export const GROUP_HEADER_CLASS = "flex items-baseline gap-2 pt-5 pb-1.5";
/** Sticks to the top of the nearest scroll container (the editor's deck section); no backing at rest (U3b). */
export const STICKY_HEADER_CLASS = "sticky top-0 z-10";
/**
 * A stuck heading (U3b, WAVE5 D4): the chrome material over the rows passing
 * under it, and the hairline the fallbacks bring back (`--chrome-edge`,
 * transparent otherwise) as an inset shadow, so the heading's 46 px, and
 * with it the group's placeholder height, never move.
 */
const STUCK_HEADER_CLASS = cn(CHROME_CLASS, "shadow-[inset_0_-1px_0_var(--chrome-edge)]");
/** The stuck heading's 12 px scroll-edge gradient over the rows below it; clear under the fallbacks. */
const STUCK_EDGE_CLASS =
  "pointer-events-none absolute inset-x-0 top-full h-3 bg-linear-to-b from-(--chrome-fade) to-transparent";

/**
 * The stuck gate's geometry (U3b): a 1 px strip just above the scrolling
 * pane's top edge (the root grown 1 px up and shrunk away from below). A
 * group whose section overlaps it has its heading stuck. The second
 * threshold tells an overlap (a positive ratio) from a section that only
 * touches the strip, the heading exactly at its own place, whose
 * intersection has no area.
 */
const STUCK_ROOT_MARGIN = "1px 0px -100% 0px";
const STUCK_THRESHOLDS = [0, 1e-6];

/** The nearest scrolling ancestor (the editor's deck section), or null for the viewport. */
function scrollRoot(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * Whether a sticky heading is stuck (U3b): its group's section straddles the
 * top edge of the scrolling pane, so rows pass under it. An
 * IntersectionObserver on the section, which is always laid out
 * (content-visibility skips a section's contents, never its own box),
 * against STUCK_ROOT_MARGIN's strip. Not a sentinel above the heading: one
 * jump across a group taller than the pane (End, a scrollbar drag, find in
 * page) carries a sentinel from one side of the pane to the other without
 * its intersection changing, and after a jump back to the top it still
 * reported its group stuck (measured in Brave). A section crosses the strip
 * whenever its heading sticks or comes loose, however far the jump.
 */
function useStuck(ref: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const section = ref.current?.parentElement;
    if (!enabled || !section || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        setStuck(entry.isIntersecting && entry.intersectionRatio > 0);
      },
      { root: scrollRoot(section), rootMargin: STUCK_ROOT_MARGIN, threshold: STUCK_THRESHOLDS },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return enabled && stuck;
}

/**
 * The editor's groups (U3a): skipped while off screen, each holding its
 * height until first drawn — a 50 px heading (20 + 20 + 6, the list's 4)
 * and its rows at 28 px (the 24 px steppers and the row's 4), 48 on touch —
 * and its drawn height after (`auto`), so the scroll height stays honest.
 * A stuck heading still sticks: it sticks inside its own section either way.
 */
const DEFERRED_GROUP_CLASS =
  "[content-visibility:auto] [contain-intrinsic-size:auto_calc(3.125rem_+_var(--group-rows)_*_1.75rem)] pointer-coarse:[contain-intrinsic-size:auto_calc(3.125rem_+_var(--group-rows)_*_3rem)]";

/**
 * A list group's heading (U3a, WAVE5 D4): the uppercase 12 px label in muted
 * ink and its count at 14 px semibold tabular in the foreground, so "LAND 38"
 * reads as a label and a number. Shared by the text and grid views and the
 * editor's leader zone, on the editor and the share page alike (U6). A
 * sticky one is the chrome material only while stuck (U3b), its gradient
 * after the count.
 */
export function GroupHeading({
  label,
  qty,
  sticky = false,
}: {
  label: string;
  qty: number;
  /** Sticks inside the editor's scrolling pane (C12); the material only while stuck (U3b). */
  sticky?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const stuck = useStuck(ref, sticky);
  const edge = stuck && <span aria-hidden data-slot="stuck-edge" className={STUCK_EDGE_CLASS} />;
  return (
    <h3
      ref={ref}
      data-stuck={stuck || undefined}
      className={cn(GROUP_HEADER_CLASS, sticky && STICKY_HEADER_CLASS, stuck && STUCK_HEADER_CLASS)}
    >
      <span className="type-eyebrow text-muted-foreground">{label}</span>
      <span data-slot="group-count" className="text-foreground text-sm font-semibold tabular-nums">
        {qty}
      </span>
      {edge}
    </h3>
  );
}

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
  /** Y7b: "Swap…" on the rows `canSwap` accepts; absent = none (share pages). */
  onSwap?: (card: EditorCard) => void;
  canSwap?: (entry: EditorEntry, card: EditorCard) => boolean;
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
  onSwap,
  canSwap,
  onPreview,
  owned,
  stickyHeaders = false,
  pop = null,
  preview = false,
}: DeckTextViewProps) {
  return (
    <>
      {groups.map((group) => (
        <section
          key={group.key}
          className={stickyHeaders ? DEFERRED_GROUP_CLASS : undefined}
          style={
            stickyHeaders ? ({ "--group-rows": group.items.length } as CSSProperties) : undefined
          }
        >
          <GroupHeading label={group.label} qty={group.qty} sticky={stickyHeaders} />
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
                  // U4a: on touch an editable row's name is its row's height,
                  // a 44 px target like the steppers beside it.
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left hover:underline",
                    onSetQty && "pointer-coarse:self-stretch",
                  )}
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
                          "w-6 text-center text-sm font-medium tabular-nums",
                          popping && "motion-safe:animate-dw-in [--dw-opacity:1] [--dw-scale:0.5]",
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
                    <span
                      data-slot="qty"
                      className="w-6 shrink-0 text-center text-sm font-medium tabular-nums"
                    >
                      {entry.qty}
                    </span>
                  )}
                  {preview ? (
                    <CardNamePreview name={card.name} image={card.image}>
                      {nameButton}
                    </CardNamePreview>
                  ) : (
                    nameButton
                  )}
                  {/* Fixed pip column (C12): min-w-20 fits four 11.2 px pips (U3a: 0.8em of the column's text-sm); a five- or six-pip cost extends to the left rather than wraps, right edges still aligned. */}
                  <span
                    data-slot="pips"
                    className={cn(
                      "inline-flex min-w-20 shrink-0 justify-end text-sm [--pip-size:0.8em]",
                      onSetQty && "pointer-coarse:min-w-12",
                    )}
                  >
                    <CostPips html={adapter.display.costHtml(card)} />
                  </span>
                  {onSwap &&
                    (canSwap?.(entry, card) ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Swap ${card.name}…`}
                        title="Swap…"
                        data-swap-row={card.id}
                        className={REVEAL_CLASS}
                        onClick={() => onSwap(card)}
                      >
                        <ArrowLeftRightIcon />
                      </Button>
                    ) : (
                      <span aria-hidden className="size-6 shrink-0 pointer-coarse:size-11" />
                    ))}
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
