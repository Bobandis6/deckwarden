/**
 * GameCard (R5a, REDESIGN.md §2 "Site shell and homepage", item 2): one of
 * the two equally prominent game cards — a labelled section carrying
 * `data-game` (so its buttons, links and shelf cards ring in the game
 * accent), the game's title and one-line pitch, Build / Browse / Search
 * actions, and the shelf of real leaders the page hands it. Server-
 * renderable; the shelf components are too.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { TileGame } from "@/lib/decks/tiles";

export interface GameCardActions {
  build: string;
  browse: { href: string; label: string };
  search: { href: string; label: string };
}

export function GameCard({
  game,
  label,
  title,
  blurb,
  actions,
  children,
  footer,
}: {
  game: TileGame;
  /** The section's accessible name ("Magic: The Gathering · Commander"). */
  label: string;
  title: string;
  blurb: string;
  actions: GameCardActions;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      data-game={game}
      className="bg-card flex min-w-0 flex-col gap-4 rounded-lg border p-5"
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">{blurb}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={actions.build} />}>
          Build a deck
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={actions.browse.href} />}>
          {actions.browse.label}
        </Button>
        <Button variant="ghost" nativeButton={false} render={<Link href={actions.search.href} />}>
          {actions.search.label}
        </Button>
      </div>
      {children}
      {footer}
    </section>
  );
}
