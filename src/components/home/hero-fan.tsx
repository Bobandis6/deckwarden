/**
 * The hero trio (U5, WAVE5 D6 section 1; upright since FRESH-UI-HOME,
 * 2026-10-30, the owner's chosen reference): three Magic commanders as full
 * `normal` cards — since 2026-10-17 the day's seeded draw from the index's
 * top 30 (`magicHome` in src/lib/home/shelves.ts; D6's "top three" before),
 * so the hero changes at 00:00 UTC — the highest-ranked of the three first.
 * The cards render in array order and stand side by side on the stage: the
 * geometry is the `.home-fan` rule in globals.css, a three-column grid whose
 * boxes come from `aspect-ratio`, so nothing shifts when the cards land.
 * The stage is the grid's ::before: a generated photographic wall and
 * tabletop per theme (home.png's on dark, the daylight reference's on light),
 * kept behind the full card images. Compact box-shadows ground the cards
 * while preserving the lit gaps. The root-layout card entrance composes its
 * transform with these resting turns; this component owns no replay state.
 * The two side cards turn 9° about the vertical axis toward the viewer,
 * the reference's shallow arc. U5's fan
 * turned the side cards 8° in the plane and dropped them 14 % so the center
 * card never covered their artist and © lines; a turn about the vertical
 * axis only narrows a card's footprint inside its own grid cell, so no card
 * covers another and the rule holds by construction (D0).
 *
 * All three remain `priority` (eager, fetchpriority high, React's preload,
 * no CardImage fade). The root gate waits for decoded artwork before its
 * one-off entrance; it never changes fetch priority or reserved dimensions.
 * Full cards only, never cropped. Not links: the hero's job is "Build a deck",
 * and the gallery below links the hubs. A card with no image paints
 * CardImage's named box in the same place.
 */
import { CardImage } from "@/components/cards/card-image";
import type { FanCard } from "@/lib/home/shelves";

/** Scryfall's `normal` box: about 230 px wide at 1440 (690 device px on a 3x phone at 390). */
const NORMAL = { width: 488, height: 680 } as const;

export function HeroFan({ cards }: { cards: FanCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div data-slot="hero-fan" className="home-fan">
      {cards.map((card) => (
        <CardImage
          key={card.id}
          src={card.image}
          alt={card.name}
          width={NORMAL.width}
          height={NORMAL.height}
          priority
          className="rounded-[4.75%/3.5%]"
        />
      ))}
    </div>
  );
}
