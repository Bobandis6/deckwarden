import type { Metadata } from "next";
import Link from "next/link";

import { RecentPublicDecks } from "@/components/deck/recent-public-decks";
import { YourDecks } from "@/components/deck/your-decks";
import { Button } from "@/components/ui/button";
import { JsonLd, websiteJsonLd } from "@/lib/seo/jsonld";

/**
 * Caching intent: force-dynamic since the rail landed (P2.3) — same
 * reasoning as /d and /u: a deck flipped private must vanish from the rail
 * immediately, and the rail is one partial-indexed query
 * (decks_recent_public). If home render cost ever shows, the escape hatch is
 * revalidate-60 at the price of that privacy lag.
 */
export const dynamic = "force-dynamic";

// Canonical guards against query-string variants; title/description inherit
// from the root layout (P2.6).
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <JsonLd data={websiteJsonLd()} />
      <h1 className="text-5xl font-bold tracking-tight">Deckwarden</h1>
      <p className="text-muted-foreground max-w-md text-center text-lg">
        A deck builder for Magic: The Gathering and beyond. Under construction.
      </p>
      <div className="flex gap-3">
        <Button nativeButton={false} render={<Link href="/decks/new" />}>
          Build a deck
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/cards" />}>
          Search cards
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/commanders" />}>
          Commanders
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/account" />}>
          Account
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          render={<a href="https://github.com/Bobandis6/deckwarden" />}
        >
          Follow the build
        </Button>
      </div>
      <YourDecks />
      <RecentPublicDecks />
    </main>
  );
}
