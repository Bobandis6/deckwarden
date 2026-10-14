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
 *
 * U3a (WAVE5 D4): the heading is the groups' `GroupHeading` (label and
 * count on space; `ruled` keeps the share page's hairline until U6). The
 * editor's image is `priority` — the pane's largest paint, so eager, high
 * fetch priority and no fade — and while a URL seed is on its way
 * (`pending`) the zone holds the card's box as a Skeleton, so the seed
 * fills a reserved slot instead of replacing the empty state.
 *
 * U3b (WAVE5 D4, the raised card): from `md` the editor's card (`raised`)
 * is a row, the card at 180 px with its facts beside it (the name and
 * Remove, then the type line and the caption as the adapter gives them,
 * `leaderFacts`), raised with U8's hero shadow (the primary at 25 % on
 * ivory, black at 60 % on charcoal) and the frame's 2 px hover lift on
 * U2's 120 ms. The Skeleton is the same row, box for box. Phones keep the
 * card above its name until U4a; the share page passes no `raised`.
 */
import { ArrowRightIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { CardImage } from "@/components/cards/card-image";
import { GroupHeading } from "@/components/deck/deck-text-view";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMac } from "@/components/use-is-mac";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { leaderCaption, leaderFacts } from "@/lib/decks/leader-caption";
import type { ViewItem } from "@/lib/decks/view-model";
import type { GameAdapter, ZoneDef } from "@/lib/games/types";
import { cn } from "@/lib/utils";

/** A leader's box: 160 px (45 % at most) above its name, the phone's and the share page's. */
const CARD_ROW_CLASS = "w-40 max-w-[45%]";
/** The raised row (U3b): from md, the card and its facts side by side, one leader to a line. */
const RAISED_ROW_CLASS = `${CARD_ROW_CLASS} md:flex md:w-full md:max-w-none md:items-start md:gap-4`;
/** The raised card's width from md: 180 px (11.25rem), the 488 / 680 aspect below it. */
const RAISED_CARD_CLASS = "md:w-45 md:shrink-0";
/**
 * The raised card's image: HERO_CARD_SHADOW's values (surface-header.tsx)
 * from md, and the frame's lift and ring on U2's tokens — 120 ms on
 * settle-120, the fade (a lazy image's) on the 250 ms cross-fade — in place
 * of CardImage's untokened 150 ms (LATER row 230).
 */
const RAISED_IMAGE_CLASS =
  "md:shadow-lg md:shadow-primary/25 md:dark:shadow-black/60 motion-safe:[transition:opacity_250ms_var(--ease-settle-250),transform_120ms_var(--ease-settle-120),box-shadow_120ms_var(--ease-settle-120)]";
/** The raised card's facts column: beside the card from md, its first line 4 px below the card's top edge. */
const RAISED_FACTS_CLASS = "md:min-w-0 md:flex-1 md:pt-1";
const CAPTION_CLASS = "text-muted-foreground block truncate font-mono text-[0.65rem]";

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
  /** The share page's hairline heading until U6 (U3a). */
  ruled?: boolean;
  /** The editor (U3a): the card image is the pane's LCP — eager, high fetch priority, no fade. */
  priority?: boolean;
  /** A URL seed is on its way (U3a): the card's box as a Skeleton instead of the empty state. */
  pending?: boolean;
  /** The editor (U3b): from md, the card raised at 180 px with its facts beside it. */
  raised?: boolean;
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
  ruled = false,
  priority = false,
  pending = false,
  raised = false,
}: LeaderZoneProps) {
  const noun = zone.label.toLowerCase();
  const readOnly = !onRemove;
  const isMac = useIsMac();
  const browse = adapter?.display.leaderBrowse;
  // R6 (status never color-only): the validation ring's severity as text,
  // described onto the card button — the name stays "Show {name}".
  const idPrefix = useId();
  return (
    <section className={ruled ? "mt-4" : undefined}>
      <GroupHeading
        label={zone.label}
        qty={items.reduce((n, i) => n + i.entry.qty, 0)}
        ruled={ruled}
      />
      {items.length === 0 && pending ? (
        // The seeded card's box (U3a): the image's aspect, the name row at
        // the Remove button's height, the caption's line — so the seed lands
        // in place and the empty state never flashes before it. Raised (U3b):
        // the same row as the card's, the facts column beside the box from md.
        <ul aria-hidden data-slot="leader-pending" className="mt-2 flex flex-wrap gap-3">
          <li className={raised ? RAISED_ROW_CLASS : CARD_ROW_CLASS}>
            <Skeleton
              className={cn(
                "aspect-[488/680] w-full rounded-[4.75%/3.5%]",
                raised && RAISED_CARD_CLASS,
              )}
            />
            {raised ? (
              <div className={RAISED_FACTS_CLASS}>
                <span className="mt-1 flex items-center gap-1 md:mt-0">
                  <Skeleton className="h-3 flex-1 md:h-3.5 md:max-w-36" />
                  <span className="size-6 shrink-0 pointer-coarse:size-11" />
                </span>
                <span className="block font-mono text-[0.65rem] md:hidden">{"\u00a0"}</span>
                <span className="type-meta hidden md:block">{"\u00a0"}</span>
              </div>
            ) : (
              <>
                <span className="mt-1 flex items-center gap-1">
                  <Skeleton className="h-3 flex-1" />
                  <span className="size-6 shrink-0 pointer-coarse:size-11" />
                </span>
                <span className="block font-mono text-[0.65rem]">{"\u00a0"}</span>
              </>
            )}
          </li>
        </ul>
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-2 py-3"
          title={`No ${noun} yet`}
          hint={
            onRemove ? (
              // The keyboard half is a fine-pointer line (Y2a), ⌘ on a Mac.
              <>
                Pick one from the full list
                <span className="pointer-coarse:hidden">
                  , or press {isMac ? "⌘" : "Ctrl"}+Enter on a search result
                </span>
                .
              </>
            ) : undefined
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
            const nameRow = (
              <span className={cn("mt-1 flex items-center gap-1", raised && "md:mt-0")}>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs",
                    raised && "md:flex-initial md:text-sm md:font-medium",
                  )}
                >
                  {card.name}
                </span>
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
            );
            const facts = raised ? leaderFacts(adapter, card) : "";
            return (
              <li key={entry.cardId} className={raised ? RAISED_ROW_CLASS : CARD_ROW_CLASS}>
                <button
                  type="button"
                  onClick={() => onPreview(card)}
                  aria-label={`Show ${card.name}`}
                  aria-describedby={levelId}
                  className={cn(
                    "focus-visible:ring-ring/50 block w-full rounded-[4.75%/3.5%] outline-none focus-visible:ring-3",
                    raised && RAISED_CARD_CLASS,
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
                    priority={priority}
                    className={cn("w-full text-xs shadow-md", raised && RAISED_IMAGE_CLASS)}
                  />
                </button>
                {level && (
                  <span id={levelId} data-slot="severity" className="sr-only">
                    {level === "error" ? "Has a problem" : "Warning"}
                  </span>
                )}
                {raised ? (
                  // The facts column (U3b): beside the card from md, where the
                  // type line joins the caption; under it on phones, as before.
                  <div className={RAISED_FACTS_CLASS}>
                    {nameRow}
                    {caption && (
                      <span data-slot="leader-caption" className={cn(CAPTION_CLASS, "md:hidden")}>
                        {caption}
                      </span>
                    )}
                    {facts && (
                      <p
                        data-slot="leader-facts"
                        className="type-meta text-muted-foreground hidden md:block"
                      >
                        {facts}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {nameRow}
                    {caption && (
                      <span data-slot="leader-caption" className={CAPTION_CLASS}>
                        {caption}
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
