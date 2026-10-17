/**
 * /decks/new's Suspense fallback (Y2a, WAVE4 D2): the page's static shell
 * IS this fallback — `useSearchParams` bails the chooser out to the client —
 * so it is what every /decks/new URL paints first, picker and editor alike.
 * Under the site header (decks/layout.tsx, 2026-10-17): a strip at the
 * editor bar's height with two skeleton bars, then a still skeleton body
 * instead of a blank page; nothing in it knows the game yet. The strip is a
 * div, not a <header> — the site header is the page's one banner — and the
 * shell fills the rest of the body (`flex-1`) under it. Server component,
 * no state, no request.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function NewDeckFallback() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" data-slot="new-deck-fallback">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-7 w-36" />
      </div>
      <main id="main" className="flex flex-1 flex-col gap-3 p-3">
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
