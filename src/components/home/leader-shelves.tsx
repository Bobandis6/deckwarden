/**
 * The homepage leader shelves (R5a, §2 item 2): six real leader cards per
 * game card. Magic shows the most-played commanders with their `small`
 * renditions under the index's honest label (EDHREC play rate via
 * Scryfall). One Piece shows the leaders with the most recent Top finishes
 * under a label that names the source — the ordering IS tournament data,
 * so the Limitless credit sits with it (the attribution rule) — or, when no
 * finish exists anywhere (the cold-start branch `opShelf` pins), leaders in
 * name order with no label and no popularity wording. One Piece cards paint
 * the leader's color gradient in the image slot and carry the printed id
 * top-left (C13's corner rule): no r2.dev request leaves this page until
 * LATER row 51 fires, and the flip only swaps the slot's contents.
 *
 * Each card is one link — its hub — named by the leader (plus the printed
 * id for One Piece, which is what tells the seventeen Luffys apart).
 * Images are lazy: the hero text is the LCP, and a small image already in
 * the viewport loads at once regardless.
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
  gradient,
  badge,
  meta,
}: {
  href: string;
  name: string;
  image: string | null;
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
          style={{ aspectRatio: `${TILE_IMAGE.width} / ${TILE_IMAGE.height}` }}
        >
          {image ? (
            <CardImage
              src={image}
              alt=""
              width={TILE_IMAGE.width}
              height={TILE_IMAGE.height}
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
        <span className="mt-1.5 block truncate text-xs font-medium group-hover/shelf:underline">
          {name}
        </span>
        {meta}
      </Link>
    </li>
  );
}

const SHELF_LABEL_CLASS = "text-muted-foreground text-xs font-medium tracking-wide uppercase";
const SHELF_GRID_CLASS = "mt-2 grid grid-cols-3 gap-2";

export function MagicShelf({ cards }: { cards: MagicShelfCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section aria-label="Most-played commanders">
      <h3 className={SHELF_LABEL_CLASS}>Most-played commanders</h3>
      <p className="text-muted-foreground mt-0.5 text-xs">
        Ranked by how much each commander is actually played (EDHREC data via Scryfall).
      </p>
      <ul className={SHELF_GRID_CLASS}>
        {cards.map((card) => (
          <ShelfCard
            key={card.id}
            href={card.href}
            name={card.name}
            image={card.image}
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
          <h3 className={SHELF_LABEL_CLASS}>Recent Top finishes</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
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
            image={null}
            gradient={ambientGradient(tileSwatches("optcg", leader.colorsMask))}
            badge={leader.externalKey}
            meta={
              <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
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
