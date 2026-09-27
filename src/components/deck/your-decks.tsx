"use client";

/**
 * Continue building for a guest (P1.7's "your decks"; tiles since R5a): the
 * decks this browser holds claim tokens for, fetched by useBrowserDecks.
 * No account, nothing stored server-side — the list is derived from the
 * claim tokens in localStorage each visit, so it renders client-side after
 * the fetch and the server HTML carries nothing (a signed-in visitor gets
 * the server-rendered ContinueBuilding instead; the page picks one).
 *
 * X1: the fetch moved into the hook and the tiles into BrowserDeckTiles —
 * the signed-out account page lists the same decks — and this component's
 * output is unchanged. The id stays as content; the header's My decks link
 * goes to /account now and nothing links to the section by hash.
 */
import { BrowserDeckTiles } from "@/components/deck/browser-deck-tiles";
import { useBrowserDecks } from "@/components/deck/use-browser-decks";

export function YourDecks() {
  const decks = useBrowserDecks();

  if (!decks || decks.length === 0) return null;

  return (
    <section id="your-decks" aria-label="Continue building" className="w-full space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Continue building
      </h2>
      <BrowserDeckTiles decks={decks} />
    </section>
  );
}
