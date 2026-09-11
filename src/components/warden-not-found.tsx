/**
 * The Warden 404 body (R5b, F8 — REDESIGN.md §4 "Warden pages"): the shield
 * mark, the eyebrow, one line of Warden voice as the page's h1, the plain
 * hint, and the two ways out. Shared by the two not-found files, because
 * Next renders them in different shells: an unmatched URL takes the ROOT
 * `not-found.tsx` inside the root layout alone (no site header — that file
 * adds one), while a `notFound()` thrown inside the (site) group renders the
 * group's `not-found.tsx` INSIDE the (site) layout, whose header is already
 * on the page (proven on dev: a root-only file put two headers on
 * /c/zz-no-such-commander-zz). Static, no data.
 */
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { WARDEN_COPY } from "@/lib/warden-copy";

export function WardenNotFound() {
  const copy = WARDEN_COPY.notFound;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <BrandMark className="size-14" />
      <p className="text-muted-foreground font-mono text-sm">{copy.eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="text-muted-foreground max-w-md">{copy.hint}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button nativeButton={false} render={<Link href="/" />}>
          Back to Deckwarden
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/cards" />}>
          Search cards
        </Button>
      </div>
    </main>
  );
}
