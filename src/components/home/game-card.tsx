/**
 * GameCard (R5a, REDESIGN.md §2 "Site shell and homepage", item 2; an open
 * region since U5, WAVE5 D6): one of home's two game regions — a labelled
 * section carrying `data-game` (so its buttons, links and shelf cards ring
 * in the game accent), the game's serif title and one-line pitch, the
 * Build / Browse / Search (and Magic's Surprise me) row, and the shelf of
 * real leaders the page hands it. The bordered `bg-card` box is gone: the
 * region sits on the page under home's gold hairline (Magic), or inside a
 * field of the game accent at 8 % (`field`, One Piece) with the words and
 * the buttons in a left quarter from `xl` and the shelf in the rest (D6
 * said thirds: there the six cards were 118 px and a leader's name
 * clipped; a quarter gives 134 px and keeps the blurb on two lines).
 * Server-renderable; the shelf components are too.
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
  blurb: string;
  actions: GameCardActions;
  children?: ReactNode;
  footer?: ReactNode;
  /** One Piece's color field (D6 section 3) instead of the open region. */
  field?: boolean;
  /** Home's rhythm (the hairline and the 96 px between sections). */
  className?: string;
}) {
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
