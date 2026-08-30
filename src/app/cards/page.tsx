/**
 * Minimal card browse UI (P0.6).
 * Caching intent: static shell — all data flows through the client component
 * hitting /api/cards/search, so this page prerenders at build time.
 */
import type { Metadata } from "next";

import { CardSearch } from "@/components/cards/card-search";

export const metadata: Metadata = {
  title: "Card search",
  description: "Search Magic: The Gathering cards by name, text, type, cost, and color.",
  // ?q= variants canonicalize to the bare search page (P2.6).
  alternates: { canonical: "/cards" },
};

export default function CardsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Card search</h1>
      <CardSearch />
      <p className="text-muted-foreground mt-12 text-xs">
        Card data and images courtesy of{" "}
        <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
          Scryfall
        </a>
        . Deckwarden is unofficial Fan Content and is not endorsed by Wizards of the Coast.
      </p>
    </main>
  );
}
