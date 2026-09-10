import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { ContinueBuilding } from "@/components/deck/continue-building";
import { RecentPublicDecks } from "@/components/deck/recent-public-decks";
import { YourDecks } from "@/components/deck/your-decks";
import { CapabilitiesStrip } from "@/components/home/capabilities-strip";
import { GameCard } from "@/components/home/game-card";
import { MagicShelf, OpShelf } from "@/components/home/leader-shelves";
import { OptcgPostureLine } from "@/components/optcg-posture-line";
import { GAME_ID } from "@/db/seed-data";
import { getSessionUserId } from "@/lib/auth";
import { magicShelf, opShelf, SHELF_SIZE } from "@/lib/home/shelves";
import { loadTopCommanders } from "@/lib/hub/queries";
import { JsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { loadRecentFinishLeaders } from "@/lib/tournaments/queries";

/**
 * The real landing page (P2.8 — beta launch package; widened to both games
 * in P4.6; the equal two-game homepage of REDESIGN.md §2 since R5a). Every
 * claim below is a shipped feature, and there are no invented numbers or
 * testimonials (cold-start rule): the shelves are real leaders — Magic's
 * most-played commanders, One Piece's leaders with recent Top finishes —
 * and the rail is real public decks or an honest empty state.
 *
 * Order per §2: hero → the two game cards with their shelves → Continue
 * building (the visitor's own decks: the account's, server-rendered, or the
 * browser's claim tokens, client-rendered) → Recent public decks → the
 * capabilities strip.
 *
 * Caching intent: force-dynamic since the rail landed (P2.3) — a deck
 * flipped private must vanish from the rail immediately. Query budget
 * (R5a, counted with DB_LOG on dev): the rail (1, with the printing joined),
 * the Magic shelf (1), the One Piece shelf (1) — three statements for a
 * guest, plus the guest's client POST /api/decks/mine; a signed-in visitor
 * adds Better Auth's session lookup and one decks_owner read. Being
 * force-dynamic is what lets this PAGE read headers() for the session —
 * the (site) layout never may (the ISR routes).
 */
export const dynamic = "force-dynamic";

// Canonical guards against query-string variants; title/description inherit
// from the root layout (P2.6). smoke:seo asserts the canonical, the
// WebSite/SearchAction JSON-LD, the hero line and the literal /leaders and
// /cards?game=optcg links below.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const [userId, topCommanders, finishLeaders] = await Promise.all([
    getSessionUserId(await headers()),
    loadTopCommanders(SHELF_SIZE),
    loadRecentFinishLeaders(GAME_ID.optcg, SHELF_SIZE),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-browse flex-1 flex-col items-center gap-12 px-4 py-16">
      <JsonLd data={websiteJsonLd()} />

      <section className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground rounded-full border px-3 py-0.5 text-xs font-medium tracking-wide uppercase">
          Open beta
        </p>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-balance">
          Your next great deck starts here.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-balance">
          Keyboard-first deck building for Magic: The Gathering Commander and the One Piece Card
          Game — free, no account needed, and your deck exists the moment you start typing.
        </p>
      </section>

      <div className="grid w-full gap-4 md:grid-cols-2">
        <GameCard
          game="mtg"
          label="Magic: The Gathering · Commander"
          title="Magic: The Gathering"
          blurb="Commander — 100 cards, one legend, every legality rule checked as you build."
          actions={{
            build: "/decks/new?game=mtg",
            browse: { href: "/commanders", label: "Browse commanders" },
            search: { href: "/cards", label: "Search cards" },
          }}
        >
          <MagicShelf cards={magicShelf(topCommanders)} />
        </GameCard>
        <GameCard
          game="optcg"
          label="One Piece Card Game"
          title="One Piece Card Game"
          blurb="50-card leader decks validated against Bandai's banlist as you type."
          actions={{
            build: "/decks/new?game=optcg",
            browse: { href: "/leaders", label: "Browse leaders" },
            search: { href: "/cards?game=optcg", label: "Search cards" },
          }}
          footer={<OptcgPostureLine className="text-muted-foreground text-[11px] leading-snug" />}
        >
          <OpShelf shelf={opShelf(finishLeaders)} />
        </GameCard>
      </div>

      {userId ? <ContinueBuilding userId={userId} /> : <YourDecks />}
      <RecentPublicDecks />

      <CapabilitiesStrip />

      <p className="text-muted-foreground max-w-xl text-center text-sm">
        Coming from Moxfield, Archidekt, or a Limitless decklist? Paste your list into the builder’s
        import and it lands in seconds. Decks built here follow you into an account whenever you{" "}
        <Link href="/account" className="underline underline-offset-4">
          sign in
        </Link>
        .{" "}
        <a
          href="https://github.com/Bobandis6/deckwarden"
          className="underline underline-offset-4"
          rel="noreferrer"
          target="_blank"
        >
          Follow the build on GitHub
        </a>
        .
      </p>
    </main>
  );
}
