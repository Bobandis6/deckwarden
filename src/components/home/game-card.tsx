/**
 * GameCard (R5a, REDESIGN.md §2 "Site shell and homepage", item 2; an open
 * region since U5, WAVE5 D6; the gallery form since FRESH-UI-HOME,
 * 2026-10-30): one of home's two game regions — a labelled section carrying
 * `data-game` (so its buttons, links and shelf cards ring in the game
 * accent), a serif heading and one-line pitch, the Build / Browse / Search
 * (and Magic's Surprise me) row, and the shelf of real leaders the page
 * hands it. Three shapes:
 * - the open region (U5): the `.type-section` title, the blurb, the button
 *   row, then the shelf, on the page under home's gold hairline;
 * - the gallery (`headline`; the owner's reference, where "Find your next
 *   commander." leads the six commanders): the headline on
 *   `.type-headline`, the blurb, the shelf, then the button row under it,
 *   so the cards come right after the words that invite the visitor to them;
 * - the field (`field`, One Piece): the accent at 8 % with the words and
 *   the buttons in a left quarter from `xl` and the shelf in the rest (D6
 *   said thirds: there the six cards were 118 px and a leader's name
 *   clipped; a quarter gives 134 px and keeps the blurb on two lines).
 * The bordered `bg-card` box is gone since U5. Server-renderable; the shelf
 * components are too.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { TileGame } from "@/lib/decks/tiles";
import { cn } from "@/lib/utils";

export interface GameCardActions {
  build: string;
  browse: { href: string; label: string };
  search: { href: string; label: string };
  /** "Surprise me" (W9c): a random legal leader into a fresh draft. */
  surprise?: { href: string; label: string };
}

/**
 * The button row (D6): one default, the rest ghosts. Each label is the
 * `<a>`'s whole content (no icon, no wrapper): `seo-smoke` matches the
 * Surprise me link's inner HTML exactly.
 */
export function GameActions({
  actions,
  className,
}: {
  actions: GameCardActions;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button nativeButton={false} render={<Link href={actions.build} />}>
        Build a deck
      </Button>
      <Button variant="ghost" nativeButton={false} render={<Link href={actions.browse.href} />}>
        {actions.browse.label}
      </Button>
      <Button variant="ghost" nativeButton={false} render={<Link href={actions.search.href} />}>
        {actions.search.label}
      </Button>
      {actions.surprise && (
        <Button variant="ghost" nativeButton={false} render={<Link href={actions.surprise.href} />}>
          {actions.surprise.label}
        </Button>
      )}
    </div>
  );
}

export function GameCard({
  game,
  label,
  title,
  headline,
  blurb,
  actions,
  children,
  footer,
  field = false,
  className,
}: {
  game: TileGame;
  /** The section's accessible name ("Magic: The Gathering · Commander"). */
  label: string;
  title: string;
  /**
   * The gallery form (FRESH-UI-HOME): this text leads the region on
   * `.type-headline` and the shelf comes before the button row; `title`
   * stays the region's name for the open region and the field.
   */
  headline?: string;
  blurb: string;
  actions: GameCardActions;
  children?: ReactNode;
  footer?: ReactNode;
  /** One Piece's color field (D6 section 3) instead of the open region. */
  field?: boolean;
  /** Home's rhythm (the hairline and the 96 px between sections). */
  className?: string;
}) {
  if (headline !== undefined) {
    return (
      <section aria-label={label} data-game={game} className={cn("min-w-0", className)}>
        {/* Two lines below md in Literata and its fallback alike (the swap
            must not reflow it): 11em at 28 px is 308 px, so both faces break
            after "next" on a 360 or 390 px phone; one line from md. */}
        <h2 className="type-headline text-(--home-heading) max-md:max-w-[11em] text-balance">
          {headline}
        </h2>
        <p className="text-muted-foreground max-w-reading mt-3">{blurb}</p>
        {children && <div className="mt-8">{children}</div>}
        <GameActions actions={actions} className="mt-8" />
        {footer}
      </section>
    );
  }
  const intro = (
    <>
      <h2 className="type-section">{title}</h2>
      <p className="text-muted-foreground max-w-reading mt-2">{blurb}</p>
    </>
  );
  return (
    <section aria-label={label} data-game={game} className={cn("min-w-0", className)}>
      {field ? (
        <div
          data-slot="game-field"
          className="rounded-2xl bg-[color-mix(in_oklab,var(--accent-game)_8%,var(--background))] p-6 md:p-8 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] xl:gap-8"
        >
          <div>
            {intro}
            <GameActions actions={actions} className="mt-5 xl:flex-col xl:items-start" />
          </div>
          <div className="mt-10 min-w-0 xl:mt-0">
            {children}
            {footer}
          </div>
        </div>
      ) : (
        <>
          {intro}
          <GameActions actions={actions} className="mt-5" />
          {children && <div className="mt-10">{children}</div>}
          {footer}
        </>
      )}
    </section>
  );
}
