/**
 * DeckTile (R5a, REDESIGN.md §2 "Deck collections" — G5 + G8): the one deck
 * tile behind every collection — home (the recent rail and Continue
 * building), the /c/ deck shelf, /account and the guest list. No "use
 * client": server components render it directly and the client `YourDecks`
 * renders it too, so it takes finished `DeckTileData` (lib/decks/tiles.ts)
 * and only paints: the 3 px identity strip along the top (an inline
 * background, aria-hidden — readable before any image), the leader-image
 * slot (the `small` rendition as a 96 px full card since U7a, WAVE5 F15, or
 * the color gradient in the same box while a game's images are gated), the
 * name as THE link (up to two lines: the card's 134 px height leaves the
 * room a one-line name would truncate into), the game chip and format, the
 * visibility word on owner surfaces, the UTC-pinned updated date, the
 * byline, and `♥ N` only when someone actually liked (engagement-smoke
 * pins the glyph as content).
 *
 * Accessibility: exactly one link per tile, named by the deck name — the
 * strip, the chip and the image are decoration (`aria-hidden`, `alt=""`).
 * The link stretches over the whole tile through an `after` pseudo-element,
 * so the card is the click target while the DOM keeps one anchor; the
 * optional `actions` slot (the account's folder select and Share link) sits
 * above that overlay. `data-game` on the tile gives its focus ring the game
 * accent (R1a's rule). Explicit width and height on the slot: nothing
 * shifts when an image lands. Hover (U5, WAVE5 D6): the tint and a 2 px
 * lift over 120 ms on settle-120, the lift `motion-safe:` only (reduced
 * motion keeps the tint); the lift is a `translate`, so no box moves.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { CardImage } from "@/components/cards/card-image";
import { badgeVariants } from "@/components/ui/badge";
import { TILE_IMAGE, type DeckTileData } from "@/lib/decks/tiles";
import { cn } from "@/lib/utils";

export function DeckTile({
  tile,
  linkTitle,
  actions,
  badge,
  compact = false,
  className,
  ...rest
}: {
  tile: DeckTileData;
  /** Owner surfaces: "Edit {name}" (the /account contract). */
  linkTitle?: string;
  actions?: ReactNode;
  /**
   * W8b: a visible chip in the meta line ("Precon") — real information,
   * unlike the decorative game chip. Absent, the tile's own declared target
   * (Y5, "Bracket 3 (declared)") takes the slot.
   */
  badge?: string;
  /**
   * U7b (WAVE5.md D8, the long lists): the compact row below `md` — the
   * card at the search rows' 26 px, tighter padding, the game chip and the
   * format hidden (one game and one format on the page that asks for it);
   * from `md` the tile as everywhere. /precons alone passes it.
   */
  compact?: boolean;
  className?: string;
} & ComponentProps<"li">) {
  return (
    // The rest spread (W3) lets `ContextMenuTrigger render={<DeckTile/>}`
    // merge its handlers and ref into the <li> itself, keeping `ul > li`
    // valid; the tile stays directive-free.
    <li
      {...rest}
      data-slot="deck-tile"
      data-game={tile.game ?? undefined}
      className={cn(
        "bg-card hover:bg-muted/40 relative flex gap-3 overflow-hidden rounded-lg border p-3 pt-4 motion-safe:transition-[background-color,translate] motion-safe:hover:-translate-y-0.5",
        "has-[[data-slot=tile-link]:focus-visible]:ring-ring/50 has-[[data-slot=tile-link]:focus-visible]:ring-2",
        compact && "max-md:gap-2 max-md:p-2 max-md:pt-2.5",
        className,
      )}
    >
      <span
        aria-hidden
        data-slot="identity-strip"
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: tile.strip }}
      />
      <span
        aria-hidden
        data-slot="tile-art"
        className={cn(
          "bg-muted relative w-24 shrink-0 overflow-hidden rounded-[4.75%/3.5%]",
          compact && "max-md:w-[1.625rem] max-md:self-start",
        )}
        style={{ aspectRatio: `${TILE_IMAGE.width} / ${TILE_IMAGE.height}` }}
      >
        {tile.leaderImage ? (
          <CardImage
            src={tile.leaderImage}
            alt=""
            width={TILE_IMAGE.width}
            height={TILE_IMAGE.height}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span
            data-slot="tile-gradient"
            className="absolute inset-0 opacity-70"
            style={{ backgroundImage: tile.slotGradient }}
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={tile.href}
          title={linkTitle}
          data-slot="tile-link"
          className="line-clamp-2 text-sm font-medium wrap-break-word outline-none hover:underline after:absolute after:inset-0 after:content-['']"
        >
          {tile.name}
        </Link>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          {tile.gameLabel && (
            <span
              aria-hidden
              className={cn(
                badgeVariants({ variant: "outline" }),
                "h-4 px-1.5 text-[10px]",
                compact && "max-md:hidden",
              )}
            >
              {tile.gameLabel}
            </span>
          )}
          {(badge ?? tile.declared) && (
            <span
              data-slot="tile-badge"
              className={cn(badgeVariants({ variant: "secondary" }), "h-4 px-1.5 text-[10px]")}
            >
              {badge ?? tile.declared}
            </span>
          )}
          {tile.formatLabel && (
            <span className={compact ? "max-md:hidden" : undefined}>{tile.formatLabel}</span>
          )}
          {tile.visibility && <span>· {tile.visibility}</span>}
        </p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          <span>{tile.dateLabel ?? `Updated ${tile.updatedLabel}`}</span>
          {tile.priceLabel && <span className="tabular-nums">· {tile.priceLabel}</span>}
        </p>
        {(tile.author || tile.likesCount > 0) && (
          <p className="text-muted-foreground mt-0.5 flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{tile.author ? `by ${tile.author}` : ""}</span>
            {tile.likesCount > 0 && (
              <span className="shrink-0 tabular-nums">{`♥ ${tile.likesCount}`}</span>
            )}
          </p>
        )}
        {actions && (
          <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </li>
  );
}

/**
 * The grid every collection lays its tiles in — one column below `md`, two
 * from it (U7a, WAVE5 D8). With the 96 px card, two columns from `md` keep
 * the text column at least a phone's (228 px at 768 in home's container,
 * where `sm`'s two columns would leave 164 at 640); /precons alone adds a
 * third from `xl` through its own class.
 */
export function DeckTileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("grid gap-3 md:grid-cols-2", className)}>{children}</ul>;
}
