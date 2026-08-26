import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
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
        <Button
          nativeButton={false}
          variant="outline"
          render={<a href="https://github.com/Bobandis6/deckwarden" />}
        >
          Follow the build
        </Button>
      </div>
    </main>
  );
}
