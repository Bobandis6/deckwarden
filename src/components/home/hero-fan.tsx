/**
 * The hero fan (U5, WAVE5 D6 section 1): the Magic index's top three
 * commanders as full `normal` cards, the most played in the center on top
 * and the next two turned −8° and +8° about their bottom edges, stepped out
 * so each overlaps the center card by about a third. The geometry is the
 * `.home-fan` rule in globals.css: 180 px tall below `md` (inside a 360 px
 * phone's gutters), 280 from it, in a box of explicit height, so nothing
 * shifts when the cards land.
 *
 * All three are `priority` (eager, fetchpriority high, React's preload, no
 * fade). D6 named the center card the LCP image, but a turned card's
 * bounding box is larger than the upright one's (238 × 305 against
 * 201 × 280 at 280 px), so whichever card paints last is the LCP: with the
 * side cards lazy they waited for hydration and the fade (LCP 4,504 ms on
 * dev at 1440, 4x CPU, Fast 4G, cold), with all three eager they paint
 * within ~40 ms of each other (2,264 ms). On a phone the H1 is the larger
 * box. Full cards only, never cropped; the side cards sit lower than the
 * center one so it never covers their artist and © lines (D0). Not links:
 * the hero's job is "Build a deck", and the shelf below links the hubs. A
 * card with no image paints CardImage's named box in the same place.
 */
import { CardImage } from "@/components/cards/card-image";
import { HERO_CARD_SHADOW } from "@/components/surface-header";
import type { FanCard } from "@/lib/home/shelves";
import { cn } from "@/lib/utils";

/** Scryfall's `normal` box: the fan's cards are 180 or 280 px tall, 540 or 840 device px on a 3x phone. */
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
          className={cn("rounded-[4.75%/3.5%]", HERO_CARD_SHADOW)}
        />
      ))}
    </div>
  );
}
