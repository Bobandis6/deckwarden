"use client";

/**
 * "On this browser" (X1, WAVE3.md D1): under the sign-in buttons of the
 * signed-out account page, the decks this browser holds claim tokens for.
 * My decks opens /account for everyone, so a guest's decks have to be one
 * click away here — and the list is the quiet answer to "what happens to my
 * decks if I sign in": these are the ones that come along.
 *
 * A client island: the list is derived from localStorage, so the server HTML
 * carries nothing and the sign-in block above never waits for it. With no
 * tokens, or when the request fails, it renders nothing at all — the page is
 * then exactly the sign-in page it was. The tiles are home's
 * (BrowserDeckTiles): the same editor link, the same Share page action.
 */
import { BrowserDeckTiles } from "@/components/deck/browser-deck-tiles";
import { useBrowserDecks } from "@/components/deck/use-browser-decks";

export function BrowserDecks() {
  const decks = useBrowserDecks();

  if (!decks || decks.length === 0) return null;

  const one = decks.length === 1;
  return (
    <section aria-label="Decks on this browser" className="w-full space-y-3">
      <div className="space-y-1">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          On this browser ·{" "}
          <span className="tabular-nums">{one ? "1 deck" : `${decks.length} decks`}</span>
        </h2>
        <p className="text-muted-foreground text-sm">
          {one ? "Sign in to keep it on every device." : "Sign in to keep them on every device."}
        </p>
      </div>
      {/* Two columns at most: the account page is the reading width (the signed-in grid's rule). */}
      <BrowserDeckTiles decks={decks} className="lg:grid-cols-2" />
    </section>
  );
}
