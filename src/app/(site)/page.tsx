import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ContinueBuilding } from "@/components/deck/continue-building";
import { RecentPublicDecks } from "@/components/deck/recent-public-decks";
import { YourDecks } from "@/components/deck/your-decks";
import { CapabilitiesStrip } from "@/components/home/capabilities-strip";
import { GameCard } from "@/components/home/game-card";
import { HeroFan } from "@/components/home/hero-fan";
import { MagicShelf, OpShelf } from "@/components/home/leader-shelves";
import { OptcgPostureLine } from "@/components/optcg-posture-line";
import { Button } from "@/components/ui/button";
import { GAME_ID } from "@/db/seed-data";
import { getSessionUserId } from "@/lib/auth";
import { FAN_SIZE, magicHome, opShelf, SHELF_SIZE } from "@/lib/home/shelves";
import { loadTopCommanders } from "@/lib/hub/queries";
import { JsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { loadRecentFinishLeaders } from "@/lib/tournaments/queries";
import { cn } from "@/lib/utils";

/**
 * The real landing page (P2.8 — beta launch package; widened to both games
 * in P4.6; the equal two-game homepage of REDESIGN.md §2 since R5a; home B,
 * the gallery, since U5 — WAVE5.md D6). Every claim below is a shipped
 * feature, and there are no invented numbers or testimonials (cold-start
 * rule): the fan and the shelves are real leaders — Magic's most-played
 * commanders, One Piece's leaders with recent Top finishes — and the rail
 * is real public decks or an honest empty state.
 *
 * Order per D6, on the wide container with a gold hairline and 96 px
 * between sections instead of boxes: the split hero (the H1, the 15-word
 * sentence, Build a deck and Browse commanders; the fan of the top three
 * commanders, eager, the LCP from `md`) → the Magic region (the shelf
 * shows the NEXT six, so no image is on the page twice) → the One Piece
 * color field → Continue building (the visitor's own decks: the account's,
 * server-rendered, or the browser's claim tokens, client-rendered; its
 * wrapper hides while empty, so a guest without decks gets no hairline
 * and no words) → Recent public decks → What Deckwarden does → the outro.
 *
 * Caching intent: force-dynamic since the rail landed (P2.3) — a deck
 * flipped private must vanish from the rail immediately. Query budget
 * (R5a, counted with DB_LOG on dev; U5 widens one LIMIT): the rail (1, with
 * the printing joined), the Magic rows (1: the fan's three and the shelf's
 * six), the One Piece shelf (1) — three statements for a guest, plus the
 * guest's client POST /api/decks/mine; a signed-in visitor adds Better
 * Auth's session lookup and one decks_owner read. Being force-dynamic is
 * what lets this PAGE read headers() for the session — the (site) layout
 * never may (the ISR routes).
 */
export const dynamic = "force-dynamic";

// Canonical guards against query-string variants; title/description inherit
// from the root layout (P2.6). smoke:seo asserts the canonical, the
// WebSite/SearchAction JSON-LD, the hero line and the literal /leaders and
// /cards?game=optcg links below.
export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Home's rhythm (U5, D6): a gold hairline with 48 px either side, never a box. */
const SECTION_CLASS = "border-gold/30 border-t py-12";

export default async function Home() {
  const [userId, topCommanders, finishLeaders] = await Promise.all([
    getSessionUserId(await headers()),
    loadTopCommanders(FAN_SIZE + SHELF_SIZE),
    loadRecentFinishLeaders(GAME_ID.optcg, SHELF_SIZE),
  ]);
  const magic = magicHome(topCommanders);

  return (
    <main id="main" className="max-w-wide mx-auto w-full flex-1 px-4">
      <JsonLd data={websiteJsonLd()} />

      <section
        className={cn(
          "grid items-center gap-10 pt-16 pb-12",
          magic.fan.length > 0 && "xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
        )}
      >
        <div className="flex flex-col items-start gap-5">
          {/* The same line count in Literata and its metric-matched fallback,
              so the font's arrival never reflows the hero (U5, measured on
              prod at 390: a 50 px shift when the fan's preloads delayed the
              font): the two disagree in boxes 352-382 px wide (3 lines
              against 2, phones of 384-414 px) and 700-750 (2 against 1,
              768-782), so phones get 7em (336 px, 3 lines in both), md
              12em (2 lines), lg the whole column (1 line; xl's third holds
              2 in both). */}
          <h1 className="type-display max-w-[7em] text-balance md:max-w-[12em] lg:max-w-none">
            Your next great deck starts here.
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty">
            Keyboard-first deck building for Commander and the One Piece Card Game. Free, no account
            needed.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" nativeButton={false} render={<Link href="/decks/new" />}>
              Build a deck
            </Button>
            <Button
              size="lg"
              variant="ghost"
              nativeButton={false}
              render={<Link href="/commanders" />}
            >
              Browse commanders
            </Button>
          </div>
        </div>
        <HeroFan cards={magic.fan} />
      </section>

      <GameCard
        className={SECTION_CLASS}
        game="mtg"
        label="Magic: The Gathering · Commander"
        title="Magic: The Gathering"
        blurb="Commander. 100 cards, one legend, every legality rule checked as you build."
        actions={{
          build: "/decks/new?game=mtg",
          browse: { href: "/commanders", label: "Browse commanders" },
          search: { href: "/cards", label: "Search cards" },
          // W9c: the Magic region's random-commander door (the contract
          // names the Magic region only — OP's roll exists via the API and
          // the same latch, just doorless until it earns one).
          surprise: { href: "/decks/new?game=mtg&surprise=1", label: "Surprise me" },
        }}
      >
        <MagicShelf cards={magic.shelf} />
      </GameCard>
      <GameCard
        className={SECTION_CLASS}
        field
        game="optcg"
        label="One Piece Card Game"
        title="One Piece Card Game"
        blurb="50-card leader decks validated against Bandai's banlist as you type."
        actions={{
          build: "/decks/new?game=optcg",
          browse: { href: "/leaders", label: "Browse leaders" },
          search: { href: "/cards?game=optcg", label: "Search cards" },
        }}
        footer={
          <OptcgPostureLine className="text-muted-foreground mt-6 text-[11px] leading-snug" />
        }
      >
        <OpShelf shelf={opShelf(finishLeaders)} />
      </GameCard>

      <div className={cn(SECTION_CLASS, "empty:hidden")}>
        {userId ? <ContinueBuilding userId={userId} /> : <YourDecks />}
      </div>
      <div className={SECTION_CLASS}>
        <RecentPublicDecks />
      </div>

      <CapabilitiesStrip className={SECTION_CLASS} />

      <div className={cn(SECTION_CLASS, "flex flex-col items-center gap-4 text-center")}>
        <BrandMark className="size-8" />
        <p className="font-display max-w-reading text-lg text-balance">
          Decks built here follow you into an account whenever you{" "}
          <Link href="/account" className="underline underline-offset-4">
            sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
