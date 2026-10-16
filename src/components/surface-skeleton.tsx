/**
 * SurfaceSkeleton (R6, C9): the instant loading shell behind the four
 * surface pages' `loading.tsx` — the commander hub (/c/), the leader hub
 * (/l/), the card page (/cards/[id]) and the deck share page (/d/). A
 * `loading.tsx` is a segment-level Suspense fallback: on a client
 * navigation it paints at once while the RSC payload loads; on a dynamic
 * render (/d/) it streams first and the content follows in a later chunk;
 * on an ISR HIT it never shows. Either way the shell must occupy the space
 * the page will take, so the swap moves nothing.
 *
 * One component, parameterized by surface: the SAME container as the page
 * (`max-w-browse`, the page's own vertical padding), the real
 * `SurfaceHeader` (the gradient band — the very element the page renders
 * before any banner, at the surface's `SURFACE_BAND` height), a hero-card
 * box at the hub card's size (`w-72` at the 488 × 680 aspect, overlapping
 * the band exactly as the hero does) where the page has one, and two
 * or three title bars at the type scale's line heights (the h1 at 36 px,
 * the meta lines at 24 / 20 px). NO text: the shell is a shape, not
 * content — nothing to announce, nothing a smoke could mistake for the
 * page, nothing to translate. Server-safe (no hooks); `Skeleton` pulses
 * `motion-safe:` only.
 *
 * U6 (WAVE5 D7): the deck shell is the share page's header B — the card's
 * box rising into the 280 px band from md (above the title below md), the
 * title, the two 16 px meta lines, the status line and the action row in
 * the column beside it — on `DECK_HEADER`, the classes the share view
 * reads. It draws one leader, the common case; a partner deck or a deck
 * without a leader replaces the shell's boxes rather than moving them.
 *
 * The editor routes get no shell (client-rendered; their "Loading deck…"
 * main stays) and neither do the index pages (their list IS the shell).
 */
import { DECK_HEADER, SURFACE_BAND, SurfaceHeader } from "@/components/surface-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type SurfaceKind = keyof typeof SURFACE_BAND;

/** The page-specific geometry each `loading.tsx` stands in for. */
const SHAPE: Record<
  SurfaceKind,
  {
    /** The page's `<main>` vertical padding. */
    main: string;
    /** The band's top margin (the hubs and the card page sit under a back link). */
    band: string;
    /** The hero card's overlap into the band; null for the deck, whose header is `DECK_HEADER`'s (U6). */
    hero: string | null;
    /** Whether a back link precedes the band. */
    backLink: boolean;
  }
> = {
  hub: { main: "py-8", band: "mt-4", hero: "-mt-24 md:-mt-28", backLink: true },
  card: { main: "py-8", band: "mt-4", hero: "-mt-20 md:-mt-24", backLink: true },
  deck: { main: "py-6", band: "", hero: null, backLink: false },
};

export function SurfaceSkeleton({
  kind,
  game,
}: {
  kind: SurfaceKind;
  /** Sets `data-game` so the band's gradient takes the surface's accent when the shell knows it. */
  game?: "mtg" | "optcg";
}) {
  const shape = SHAPE[kind];
  return (
    <main
      id="main"
      aria-busy="true"
      aria-label="Loading"
      data-slot="surface-skeleton"
      data-kind={kind}
      // min-h-dvh (R6): the shell fills the viewport so the site footer starts
      // below the fold while the page streams — the footer was the ONE
      // layout-shift source measured (0.099 on the deck page and the hub
      // when the short fallback swapped for the tall page); a shift from
      // outside the viewport does not count, and every real page is taller.
      className={cn("max-w-browse mx-auto min-h-dvh w-full flex-1 px-4", shape.main)}
      data-game={game}
    >
      {/* The back link is an inline anchor in main's 24 px line box. */}
      {shape.backLink && <Skeleton data-slot="skeleton-back" className="h-6 w-28" />}
      <SurfaceHeader className={cn(shape.band, SURFACE_BAND[kind])} />
      {kind === "deck" ? (
        // The share page's header B (U6): one leader's box, then the text column.
        <div className={DECK_HEADER.grid}>
          <div className={DECK_HEADER.cards}>
            <Skeleton
              data-slot="skeleton-hero"
              className={cn(DECK_HEADER.card, "rounded-[4.75%/3.5%]")}
              style={{ aspectRatio: "488 / 680" }}
            />
          </div>
          <div className={DECK_HEADER.text}>
            <Skeleton data-slot="skeleton-title" className="h-9 w-3/5 max-w-md" />
            <Skeleton className="mt-1 h-4 w-1/2 max-w-sm" />
            <Skeleton className="mt-0.5 h-4 w-2/3 max-w-md" />
            <Skeleton className="mt-2 h-5 w-1/2 max-w-xs" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Skeleton className="h-7 w-20 rounded-lg pointer-coarse:h-11" />
              <Skeleton className="h-7 w-24 rounded-lg pointer-coarse:h-11" />
              <Skeleton className="h-7 w-28 rounded-lg pointer-coarse:h-11" />
            </div>
          </div>
        </div>
      ) : shape.hero ? (
        <div className="flex flex-col gap-6 md:flex-row md:gap-8">
          <div className={cn("relative shrink-0", shape.hero)}>
            <Skeleton
              data-slot="skeleton-hero"
              className="w-72 rounded-2xl"
              style={{ aspectRatio: "488 / 680" }}
            />
          </div>
          <div className="min-w-0 flex-1 md:pt-4">
            <Skeleton data-slot="skeleton-title" className="h-9 w-3/5 max-w-sm" />
            <Skeleton className="mt-1 h-6 w-2/5 max-w-48" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-full max-w-lg" />
              <Skeleton className="h-4 w-11/12 max-w-md" />
              <Skeleton className="h-4 w-4/5 max-w-sm" />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
