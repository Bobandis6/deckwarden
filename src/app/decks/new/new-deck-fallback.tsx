/**
 * /decks/new's Suspense fallback (Y2a, WAVE4 D2): the page's static shell
 * IS this fallback — `useSearchParams` bails the chooser out to the client —
 * so it is what every /decks/new URL paints first, picker and editor alike.
 * A header strip (the mark → home, the editor header's height) and a still
 * skeleton instead of a blank page; nothing in it knows the game yet.
 * Server component, no state, no request.
 */
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Skeleton } from "@/components/ui/skeleton";

export function NewDeckFallback() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true" data-slot="new-deck-fallback">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Link
          href="/"
          aria-label="Deckwarden"
          className="focus-visible:ring-ring/50 flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center"
        >
          <BrandMark className="size-8" />
        </Link>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-7 w-36" />
      </header>
      <main className="flex flex-1 flex-col gap-3 p-3">
        <p className="sr-only" role="status">
          Loading the deck builder…
        </p>
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full max-w-md" />
        <Skeleton className="h-5 w-64" />
      </main>
    </div>
  );
}
