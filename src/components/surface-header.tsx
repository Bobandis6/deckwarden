/**
 * SurfaceHeader (R5b, REDESIGN.md §2 "Hubs" + §4 G3): the accent-gradient
 * band at the top of the hub pages (/c/, /l/), the card page and the deck
 * share page — the "stronger card-and-title introduction". One component,
 * two paints: the game accent as a vertical gradient (the band sits inside
 * a `data-game` root on every game surface), and on top of it, when the
 * caller resolved one, the leader's art crop as a banner under a bottom
 * veil that dissolves into the page background. Outside a game context —
 * today only the /cards and /d loading shells — the band paints the crest's
 * own ramp instead, green into charcoal, not a gold-brand wash (W2, D0
 * "brand details"); an ancestor variant (`[[data-game]_&]`) picks the paint
 * with zero client code. W2 also ends every band with a 1 px gold rule at
 * 30 % along its bottom edge — the brand hairline, over art and veil alike.
 * `SurfaceSkeleton` renders THIS component, so the shells inherit both.
 *
 * Art comes from R2's resolver (`resolveCardArt` / `loadDeckLeaderArt`) —
 * the hub page calls it in its server render, the deck page reuses the art
 * it already resolved, the card page passes nothing (the full card IS the
 * art there, and 35k card pages must not each pay a Scryfall call), and the
 * One Piece hub goes through the adapter gate, which answers null before
 * any network (§3: One Piece art is off until Bandai answers).
 *
 * Attribution (CLAUDE.md hard rule, §3): whenever the crop renders, the
 * credit renders beside it as a VISIBLE `<p>` — `art.credit`, built once by
 * `artCredit` — in the band's top-right corner; never a tooltip (R2's
 * reasoning: a tooltip hides the line the rule wants on screen). Top-right
 * because a hero card (the hub's, and the share page's leader since U6)
 * overlaps the band's bottom-left, and C13's corner rule keeps badges in
 * the top corners.
 *
 * Credit recipe (R6 contrast audit): `text-foreground bg-background/85`.
 * The ambient chip's muted recipe (`text-muted-foreground bg-background/80`)
 * is fine over 4–8 % art but measured 3.4:1 in the light theme over a dark
 * crop at full opacity; the foreground on a denser pill reads ≥ 11:1 over
 * white, black and mid grey in both themes.
 *
 * Layout: the band has an EXPLICIT height (the default below, or the
 * caller's `h-*`), so the page reserves it before the banner loads and
 * nothing shifts; the banner is `alt=""` (decorative — the credit is the
 * text), `loading="eager"` but `fetchpriority="low"`, so the hero card
 * (the LCP, `priority`) and the title paint first and the crop lands over
 * the gradient when it arrives — the intended progressive look. No state,
 * no hooks: server components render it directly and the client share view
 * renders it too.
 */
import type { CardArt } from "@/lib/cards/art";
import { cn } from "@/lib/utils";

/**
 * The band heights per surface (R5b's numbers), exported so the pages, the
 * client share view and the C9 loading shells (`SurfaceSkeleton`, R6) all
 * read ONE string per surface — a skeleton can never drift from the band
 * it stands in for. `hub` is the default below. The deck band is 160 px
 * below md and 280 from md since U6 (WAVE5 D7), its leader card
 * overlapping the lower-left edge; `sm:h-40` overrides the default's `sm:`
 * step.
 */
export const SURFACE_BAND = {
  hub: "h-36 sm:h-44 md:h-56",
  card: "h-28 sm:h-36 md:h-44",
  deck: "h-40 sm:h-40 md:h-70",
} as const;

/**
 * The share page's header under its band (U6, WAVE5 D7, direction B), read
 * by the share view and its loading shell (`SurfaceSkeleton`) so the shell
 * holds the page's boxes. From md the leader card's column sits beside the
 * H1's, 16 px in from the band's edge and 16 px from the title column, and
 * the card rises into the band by 112 px (40 % of its 280; `relative`, so
 * it paints over the band); below md the card sits above the H1. The card
 * is 140 px below md and 200 from it; partners share the column at 120 and
 * 160 each. The gutters are 16, not the comp's 24: at 768 (a tablet in
 * portrait) the title column is then 504 px, room for the owner's action
 * row (492 px) on one line like the visitor's, so a guest owner's row,
 * which swaps in after hydration (LATER row 177), moves nothing.
 */
export const DECK_HEADER = {
  grid: "md:grid md:grid-cols-[auto_minmax(0,1fr)] md:gap-x-4 md:pl-4",
  cards: "relative mt-4 flex gap-3 md:-mt-28",
  card: "w-35 md:w-50",
  partner: "w-30 md:w-40",
  text: "mt-4 min-w-0",
} as const;

/**
 * The hero card's shadow (U8, WAVE5.md D3): the full card that overlaps a
 * band's lower edge (the /c/ and /l/ hubs, the card page's printing, and
 * since U6 the share page's leader) lifts on a shadow tinted with the
 * action green on ivory and a deep black on charcoal, where the stock gray
 * at 10 % read as nothing. One string, so the hero cards can't drift.
 */
export const HERO_CARD_SHADOW = "shadow-lg shadow-primary/25 dark:shadow-black/60";

export function SurfaceHeader({
  art = null,
  className,
}: {
  /** The resolved crop, or null for the gradient alone. */
  art?: CardArt | null;
  /** Height and spacing overrides (`h-*`, `mt-*`). */
  className?: string;
}) {
  return (
    <div
      data-slot="surface-header"
      data-banner={art ? "art_crop" : "gradient"}
      className={cn("relative overflow-hidden rounded-2xl", SURFACE_BAND.hub, className)}
    >
      <div
        aria-hidden
        data-slot="surface-gradient"
        className="from-accent-game/25 via-accent-game/10 to-accent-game/5 absolute inset-0 hidden bg-linear-to-b [[data-game]_&]:block"
      />
      <div
        aria-hidden
        data-slot="surface-gradient-generic"
        // Heavier alphas than the accent ramp on purpose: the crest green is
        // itself dark, so 45/15/35 gives the same visual presence the bright
        // accents get from 25/10/5 (compared side by side in the W2 pass).
        className="from-primary/45 via-primary/15 via-55% absolute inset-0 bg-linear-to-b to-[#242c2f]/35 [[data-game]_&]:hidden"
      />
      {art && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Scryfall CDN hotlink by design (CLAUDE.md image rule); the credit sits beside it. */}
          <img
            src={art.url}
            alt=""
            // Scryfall's art_crop nominal size. Inert for layout — the band's
            // height is explicit and the image is absolutely sized to it — but
            // every image in the product is sized (R6's `img:not([width])` audit).
            width={626}
            height={457}
            decoding="async"
            loading="eager"
            fetchPriority="low"
            data-slot="surface-banner"
            className="absolute inset-0 h-full w-full object-cover object-[50%_30%]"
          />
          <div
            aria-hidden
            data-slot="surface-veil"
            className="from-background/75 absolute inset-0 bg-linear-to-t via-transparent to-transparent"
          />
          <p
            data-slot="art-credit"
            className="text-foreground bg-background/85 absolute top-2 right-3 max-w-[calc(100%-1.5rem)] rounded-md px-1.5 py-0.5 text-right type-micro"
          >
            {art.credit}
          </p>
        </>
      )}
      {/* The gold rule (W2): last in the stack so it survives art + veil. */}
      <div
        aria-hidden
        data-slot="band-rule"
        className="bg-gold/30 absolute inset-x-0 bottom-0 h-px"
      />
    </div>
  );
}
