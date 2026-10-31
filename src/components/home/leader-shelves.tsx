/**
 * The homepage leader shelves (R5a, §2 item 2): six real leader cards per
 * game region. Magic shows the commanders in the most EDHREC decklists
 * that are not in the day's hero fan (U5: the shelf never repeats a fan
 * card; the fan rotates daily since 2026-10-17, so the shelf's six are the
 * highest-ranked of the rest), with their `normal` renditions (FRESH-UI-HOME:
 * the gallery shows them at up to about 200 px) under a serif heading and
 * the index's honest
 * clause (decklist popularity via Scryfall, not games played: Y1's sense in
 * one clause, WAVE5 D6). One Piece shows the leaders with the most recent
 * Top finishes under a heading and a clause that names the source — the
 * ordering IS tournament data, so the Limitless credit sits with it (the
 * attribution rule) — or, when no finish exists anywhere (the cold-start
 * branch `opShelf` pins), leaders in name order with no heading and no
 * popularity wording. One Piece cards carry the printed id top-left (C13's
 * corner rule) and, since P4.9, the mirror's small WebP in the image slot;
 * a leader with no image paints its color gradient there instead.
 *
 * Each card is one link — its hub — named by the leader (plus the printed
 * id for One Piece, which is what tells the seventeen Luffys apart). The
 * cards sit three across below `lg` and in one row of six from it, about
 * 195 px wide in the wide container (FRESH-UI-HOME; 150 before), their
 * names on up to two 14 px lines with a two-line floor so rows align.
 * Images are lazy: both shelves sit below the fold at every width, under
 * the hero trio's eager cards (the LCP from `lg`; the H1 on a phone).
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { CardImage } from "@/components/cards/card-image";
import { ColorChipList } from "@/components/color-chip";
import { ambientGradient } from "@/lib/decks/ambient-art";
import { TILE_IMAGE, tileSwatches } from "@/lib/decks/tiles";
import { MIN_EVENT_PLAYERS, TOP_PLACEMENT } from "@/lib/games/mtg/topdeck-map";
import { getAdapter } from "@/lib/games/registry";
import type { MagicShelfCard, OpShelf as OpShelfData } from "@/lib/home/shelves";

function ShelfCard({
  href,
  name,
  image,
  size,
  gradient,
  badge,
  meta,
}: {
  href: string;
  name: string;
  image: string | null;
  /** The rendition's box: Scryfall's `normal` for Magic, the mirror's small WebP for One Piece. */
  size: { readonly width: number; readonly height: number };
  gradient: string;
  badge?: string;
  meta?: ReactNode;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="group/shelf focus-visible:ring-accent-game block rounded-md outline-none focus-visible:ring-2"
      >
        <span
          className="bg-muted relative block overflow-hidden rounded-[4.75%/3.5%]"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        >
          {image ? (
            <CardImage
              src={image}
              alt=""
              width={size.width}
              height={size.height}
              frame
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <span
              aria-hidden
              data-slot="shelf-gradient"
              className="absolute inset-0 opacity-70"
              style={{ backgroundImage: gradient }}
            />
          )}
          {badge && (
            <span className="bg-background/85 absolute top-1 left-1 rounded px-1 font-mono text-[10px] uppercase">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 font-medium group-hover/shelf:underline">
          {name}
        </span>
        {meta}
      </Link>
    </li>
  );
}

/** A shelf's serif heading (U5: the uppercase label is for list groups only, F4). */
const SHELF_HEADING_CLASS = "type-small";
const SHELF_CLAUSE_CLASS = "text-muted-foreground mt-1 text-sm";
/** The gallery grid (FRESH-UI-HOME, globals.css): three across, six from `lg`, the cards up to about 200 px. */
const SHELF_GRID_CLASS = "home-gallery mt-4";
/** Scryfall's `normal` box, the Magic shelf's rendition since FRESH-UI-HOME. */
const MAGIC_IMAGE = { width: 488, height: 680 } as const;

export function MagicShelf({ cards }: { cards: MagicShelfCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section aria-label="Popular in Commander decklists">
      <h3 className={SHELF_HEADING_CLASS}>Popular in Commander decklists</h3>
      <p className={SHELF_CLAUSE_CLASS}>
        Ranked by EDHREC decklist count via Scryfall, not games played.
      </p>
      <ul className={SHELF_GRID_CLASS}>
        {cards.map((card) => (
          <ShelfCard
            key={card.id}
            href={card.href}
            name={card.name}
            image={card.image}
            size={MAGIC_IMAGE}
            gradient={ambientGradient(tileSwatches("mtg", card.ciMask))}
          />
        ))}
      </ul>
    </section>
  );
}

export function OpShelf({ shelf }: { shelf: OpShelfData }) {
  if (shelf.leaders.length === 0) return null;
  const tournaments = getAdapter("optcg").capabilities.tournaments;
  const labeled = shelf.labeled && tournaments !== undefined;
  return (
    <section aria-label={labeled ? "Recent Top finishes" : "Leaders"}>
      {labeled && (
        <>
          <h3 className={SHELF_HEADING_CLASS}>Recent Top finishes</h3>
          <p className={SHELF_CLAUSE_CLASS}>
            Leaders placing top {TOP_PLACEMENT} at {MIN_EVENT_PLAYERS}+ player events, newest first.
            Results from{" "}
            <a href={tournaments.sourceHref} className="underline" rel="noreferrer" target="_blank">
              {tournaments.sourceLabel}
            </a>
            .
          </p>
        </>
      )}
      <ul className={SHELF_GRID_CLASS}>
        {shelf.leaders.map((leader) => (
          <ShelfCard
            key={leader.id}
            href={leader.href}
            name={leader.name}
            image={leader.image}
            size={TILE_IMAGE}
            gradient={ambientGradient(tileSwatches("optcg", leader.colorsMask))}
            badge={leader.externalKey}
            meta={
              <span className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                <ColorChipList game="optcg" mask={leader.colorsMask} className="text-[9px]" />
                {leader.life !== null && <span>{leader.life} Life</span>}
              </span>
            }
          />
        ))}
      </ul>
    </section>
  );
}
