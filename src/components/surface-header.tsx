/**
 * SurfaceHeader (R5b, REDESIGN.md §2 "Hubs" + §4 G3): the accent-gradient
 * band at the top of the hub pages (/c/, /l/), the card page and the deck
 * share page — the "stronger card-and-title introduction". One component,
 * two paints: the game accent as a vertical gradient (every surface — the
 * band sits inside a `data-game` root, so `--accent-game` resolves to the
 * Magic or One Piece accent, or the brand on a game-neutral page), and on
 * top of it, when the caller resolved one, the leader's art crop as a
 * banner under a bottom veil that dissolves into the page background.
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
 * because the hub hero card overlaps the band's bottom-left, and C13's
 * corner rule keeps badges in the top corners.
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
 * it stands in for. `hub` is the default below.
 */
export const SURFACE_BAND = {
  hub: "h-36 sm:h-44 md:h-56",
  card: "h-28 sm:h-36 md:h-44",
  deck: "h-32 sm:h-40 md:h-48",
} as const;

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
        className="from-accent-game/25 via-accent-game/10 to-accent-game/5 absolute inset-0 bg-linear-to-b"
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
            className="text-foreground bg-background/85 absolute top-2 right-3 max-w-[calc(100%-1.5rem)] rounded-md px-1.5 py-0.5 text-right text-[0.65rem] leading-4"
          >
            {art.credit}
          </p>
        </>
      )}
    </div>
  );
}
