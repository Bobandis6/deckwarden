/**
 * /sets — every released Magic set on one page (X4b, WAVE3.md D4 as
 * amended by the owner's answers of 2026-09-28): the Browse menu's way in
 * for someone who doesn't know the sets (the owner, 2026-09-28). Grouped by
 * year, newest first; each row a link to /cards?set=<code> that shows the
 * set's place in its line. The filter island (SetsIndexView) narrows by
 * name or code and "Main sets only" (on by default) over rows the server
 * already shipped — every row is a link in the HTML.
 *
 * Caching intent: ISR, revalidate daily — `loadReleasedSets` (one
 * statement, ~140 ms warm) runs at build and at each daily revalidation,
 * zero statements per visit. A set appears on its release date, so it
 * joins this page at the first revalidation after that date, up to a day
 * late (the /api/sets cadence, LATER row 130). No searchParams, headers()
 * or cookies(), by design: any of them would render the page on every hit.
 * The filter is client state, never the URL (the /precons decision, LATER
 * row 89).
 *
 * Magic only: One Piece sets carry Bandai labels and no release dates
 * (LATER row 115), so its pill is disabled with a hint, never a dead link —
 * static markup, not GameSwitch, as on /precons: there is no second page.
 */
import type { Metadata } from "next";

import { GAME_SWITCH_LABELS } from "@/components/game-switch";
import { SetsIndexView } from "@/components/sets/sets-index-view";
import { GAME_ID } from "@/db/seed-data";
import { loadReleasedSets } from "@/lib/sets/queries";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Sets",
  description:
    "Every released Magic: The Gathering set, newest first — expansions, Commander decks, reprint sets and more. Pick a set to see every card in it.",
  alternates: { canonical: "/sets" },
};

export default async function SetsPage() {
  const sets = await loadReleasedSets(GAME_ID.mtg);

  return (
    <main className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game="mtg">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Sets</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Every released Magic set, newest first. Pick one to see its cards.
      </p>

      <div role="group" aria-label="Game" className="mt-4 flex flex-wrap items-center gap-1.5">
        <span
          aria-current="page"
          className="bg-foreground text-background inline-flex items-center rounded-md border px-2 py-1 text-sm pointer-coarse:min-h-11 pointer-coarse:px-3"
        >
          {GAME_SWITCH_LABELS.mtg}
        </span>
        <span
          aria-disabled="true"
          className="text-muted-foreground inline-flex items-center rounded-md border border-dashed px-2 py-1 text-sm pointer-coarse:min-h-11 pointer-coarse:px-3"
        >
          {GAME_SWITCH_LABELS.optcg} — soon
        </span>
        <span className="text-muted-foreground text-xs">One Piece sets are coming.</span>
      </div>

      <SetsIndexView sets={sets} />

      <p className="text-muted-foreground mt-12 text-xs">
        Set names, types and release dates via{" "}
        <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
          Scryfall
        </a>
        .
      </p>
    </main>
  );
}
