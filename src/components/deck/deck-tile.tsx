/**
 * DeckTile (R5a, REDESIGN.md §2 "Deck collections" — G5 + G8): the one deck
 * tile behind every collection — home (the recent rail and Continue
 * building), the /c/ deck shelf, /account and the guest list. No "use
 * client": server components render it directly and the client `YourDecks`
 * renders it too, so it takes finished `DeckTileData` (lib/decks/tiles.ts)
 * and only paints: the 3 px identity strip along the top (an inline
 * background, aria-hidden — readable before any image), the leader-image
 * slot (the `small` rendition, or the color gradient while a game's images
 * are gated), the name as THE link, the game chip and format, the
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
 * shifts when an image lands.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { CardImage } from "@/components/cards/card-image";
import { badgeVariants } from "@/components/ui/badge";
import { TILE_IMAGE, type DeckTileData } from "@/lib/decks/tiles";
import { cn } from "@/lib/utils";

export function DeckTile({
  tile,
  linkTitle,
  actions,
  className,
}: {
  tile: DeckTileData;
  /** Owner surfaces: "Edit {name}" (the /account contract). */
  linkTitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <li
      data-slot="deck-tile"
      data-game={tile.game ?? undefined}
      className={cn(
        "bg-card hover:bg-muted/40 relative flex gap-3 overflow-hidden rounded-lg border p-3 pt-4 motion-safe:transition-colors",
        "has-[[data-slot=tile-link]:focus-visible]:ring-ring/50 has-[[data-slot=tile-link]:focus-visible]:ring-2",
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
        className="bg-muted relative w-14 shrink-0 overflow-hidden rounded-[4.75%/3.5%]"
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
          className="block truncate text-sm font-medium outline-none hover:underline after:absolute after:inset-0 after:content-['']"
        >
          {tile.name}
        </Link>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          {tile.gameLabel && (
            <span
              aria-hidden
              className={cn(badgeVariants({ variant: "outline" }), "h-4 px-1.5 text-[10px]")}
            >
              {tile.gameLabel}
            </span>
          )}
          {tile.formatLabel && <span>{tile.formatLabel}</span>}
          {tile.visibility && <span>· {tile.visibility}</span>}
          <span>· Updated {tile.updatedLabel}</span>
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

/** The grid every collection lays its tiles in — one column on phones, three from `lg`. */
export function DeckTileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</ul>;
}
