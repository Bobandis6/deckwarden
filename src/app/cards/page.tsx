/**
 * Card browse (P0.6; game-scoped P4.4). ?game= picks the corpus — tabs, not
 * separate routes, because the surface is one search UI over one API and the
 * game is a filter, not a different product.
 *
 * Canonical story (extends P2.6's call): filter/query variants still
 * canonicalize away, but the GAME variants are distinct corpora with their
 * own audiences, so each is its own canonical — bare /cards for MTG (the
 * default, and the 4-year-old URL), /cards?game=optcg for OP. smoke:seo
 * pins both.
 *
 * Caching intent: dynamic (reads searchParams for the game + initial filter
 * values so hub browse links land preset) — the shell is tiny and all card
 * data still flows through the client component hitting /api/cards/search.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { CardSearch } from "@/components/cards/card-search";

function gameFrom(sp: Record<string, string | string[] | undefined>): "mtg" | "optcg" {
  return sp.game === "optcg" ? "optcg" : "mtg";
}

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export async function generateMetadata({ searchParams }: PageProps<"/cards">): Promise<Metadata> {
  const game = gameFrom(await searchParams);
  if (game === "optcg") {
    return {
      title: "One Piece card search",
      description: "Search One Piece Card Game cards by name, text, type, cost, color, and trait.",
      alternates: { canonical: "/cards?game=optcg" },
    };
  }
  return {
    title: "Card search",
    description: "Search Magic: The Gathering cards by name, text, type, cost, and color.",
    alternates: { canonical: "/cards" },
  };
}

export default async function CardsPage({ searchParams }: PageProps<"/cards">) {
  const sp = await searchParams;
  const game = gameFrom(sp);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Card search</h1>

      <nav aria-label="Game" className="mt-3 flex gap-1.5">
        <Link
          href="/cards"
          aria-current={game === "mtg" ? "page" : undefined}
          className={`rounded-md border px-2 py-1 text-sm ${game === "mtg" ? "bg-foreground text-background" : "hover:underline"}`}
        >
          Magic: The Gathering
        </Link>
        <Link
          href="/cards?game=optcg"
          aria-current={game === "optcg" ? "page" : undefined}
          className={`rounded-md border px-2 py-1 text-sm ${game === "optcg" ? "bg-foreground text-background" : "hover:underline"}`}
        >
          One Piece
        </Link>
      </nav>

      <CardSearch
        key={game}
        game={game}
        // ?q= serves home's SearchAction JSON-LD; ?name= is the API's own key.
        initialName={str(sp.q) || str(sp.name)}
        initialType={str(sp.type)}
        initialColors={game === "mtg" ? str(sp.ci) : str(sp.color)}
        distinctField={game === "optcg" ? "traits" : undefined}
        initialDistinct={game === "optcg" ? str(sp.traits) : ""}
      />

      {game === "optcg" ? (
        <p className="text-muted-foreground mt-12 text-xs">
          ©Eiichiro Oda/Shueisha, Toei Animation · ONE PIECE CARD GAME ©BANDAI. Deckwarden is
          unofficial fan content, not affiliated with or endorsed by Bandai, Shueisha, or Toei
          Animation. No official card-data API exists for the One Piece Card Game —{" "}
          <Link href="/legal#one-piece" className="underline">
            how we source this data
          </Link>
          .
        </p>
      ) : (
        <p className="text-muted-foreground mt-12 text-xs">
          Card data and images courtesy of{" "}
          <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
            Scryfall
          </a>
          . Deckwarden is unofficial Fan Content and is not endorsed by Wizards of the Coast.
        </p>
      )}
    </main>
  );
}
