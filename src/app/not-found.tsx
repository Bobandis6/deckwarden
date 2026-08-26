/**
 * Custom 404 (P1.8) — renders for notFound() calls AND any unmatched URL
 * (root not-found convention). Static by nature; no data fetching.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p className="text-muted-foreground font-mono text-sm">404</p>
      <h1 className="text-3xl font-bold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="text-muted-foreground max-w-md text-center">
        The card may have been removed, the deck deleted, or the link mistyped.
      </p>
      <div className="flex gap-3">
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
