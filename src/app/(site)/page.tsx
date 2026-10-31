import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
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
import type { TileGame } from "@/lib/decks/tiles";
import { magicHome, opShelf, POOL_SIZE, SHELF_SIZE, utcDayKey } from "@/lib/home/shelves";
import { loadTopCommanders } from "@/lib/hub/queries";
import { JsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { loadRecentFinishLeaders } from "@/lib/tournaments/queries";
import { cn } from "@/lib/utils";

/**
 * The real landing page (P2.8 — beta launch package; widened to both games
 * in P4.6; the equal two-game homepage of REDESIGN.md §2 since R5a; home B,
 * the gallery, since U5 — WAVE5.md D6; the opening in the owner's chosen
 * look since FRESH-UI-HOME, 2026-10-30). Every claim below is a shipped
 * feature, and there are no invented numbers or testimonials (cold-start
 * rule): the trio and the shelves are real leaders — Magic's most-played
 * commanders, One Piece's leaders with recent Top finishes — and the rail
 * is real public decks or an honest empty state.
 *
 * Order: the band (full-bleed, its content in the wide container: the H1,
 * the 15-word sentence, and the day's three commanders from the index's
 * top 30 standing upright on the green stage, eager, the LCP from `lg`) →
 * the doors row (the wide Build a deck and Browse commanders at the left,
 * the two game tiles at the right, each the door to that game's draft) →
 * "Find your next commander." (the Magic region: the six highest-ranked of
 * the rest, never a trio card, so no image is on the page twice, then the
 * region's button row) → the One Piece color field → Continue building (the
 * visitor's own decks: the account's, server-rendered, or the browser's
 * claim tokens, client-rendered; its wrapper hides while empty, so a guest
 * without decks gets no hairline and no words) → Recent public decks →
 * What Deckwarden does → the outro. From the One Piece field on, D6's
 * rhythm: a gold hairline with 48 px either side, never a box.
 *
 * Caching intent: force-dynamic since the rail landed (P2.3) — a deck
 * flipped private must vanish from the rail immediately. Query budget
 * (R5a, counted with DB_LOG on dev; U5 widened one LIMIT to 9, the daily
 * fan rotation of 2026-10-17 to 30): the rail (1, with the printing
 * joined), the Magic rows (1: the index's top 30, split in code into the
 * day's trio of three and the shelf's six — `magicHome`), the One Piece
 * shelf (1) — three statements for a guest, plus the guest's client POST
 * /api/decks/mine; a signed-in visitor adds Better Auth's session lookup
 * and one decks_owner read. The trio's day is the UTC date read once per
 * request (`utcDayKey(new Date())`) and handed to the pure split: a
 * force-dynamic page renders per request, so the trio turns over at 00:00
 * UTC with no cache to wait out. Being force-dynamic is what lets this
 * PAGE read headers() for the session — the (site) layout never may (the
 * ISR routes).
 */
export const dynamic = "force-dynamic";

// Canonical guards against query-string variants; title/description inherit
// from the root layout (P2.6). smoke:seo asserts the canonical, the
// WebSite/SearchAction JSON-LD, the hero line and the literal /leaders and
// /cards?game=optcg links below.
export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Home's rhythm (U5, D6): a gold hairline with 48 px either side, never a box. */
const SECTION_CLASS = "border-gold/30 border-t py-12";
/** The wide container every band's content sits in; the hero band itself runs edge to edge. */
const CONTAINER_CLASS = "max-w-wide mx-auto w-full px-4";

/**
 * The tiles' paintings (HOME-ATMOSPHERE, 2026-10-31, the owner's ask on the
 * reference, which LATER row 372 had held open): the two landscapes cut from
 * the owner's own rendered reference with its labels and marks painted out
 * (no game logo or name is in the pixels; the words are the HTML below),
 * upscaled for 2x screens and saved under public/home. `focus` is the
 * `object-position` the `cover` crop keeps in view at every tile size: the
 * castle on its island for Magic, the ship between the islands for One
 * Piece. Change a file or a crop here; nothing else knows the paths.
 */
const TILE_ART: Record<TileGame, { src: string; width: number; height: number; focus: string }> = {
  mtg: { src: "/home/mtg-tile.webp", width: 1088, height: 405, focus: "62% 50%" },
  optcg: { src: "/home/optcg-tile.webp", width: 1158, height: 405, focus: "56% 45%" },
};

/**
 * A game's door (FRESH-UI-HOME; a painting since HOME-ATMOSPHERE): the
 * game's landscape under a scrim (`.home-tile`, `.home-tile-art` and the
 * scrim are the rules in globals.css; `data-game` sets --accent-game, the
 * field that shows until the art lands), the serif name, the format line and
 * an arrow in the primary's ivory over it, the same in both themes since the
 * painting is the same; the lift is DeckTile's. The art is a plain `<img>`
 * of a static file (no optimizer transformation, CLAUDE.md), eager but at
 * low fetch priority so it never competes with the trio for the LCP, and
 * decorative (empty alt): the link's words are its name.
 */
function GameTile({
  game,
  href,
  name,
  format,
}: {
  game: TileGame;
  href: string;
  name: string;
  format: string;
}) {
  const art = TILE_ART[game];
  return (
    <Link
      href={href}
      data-game={game}
      style={{ "--tile-focus": art.focus } as CSSProperties}
      className="home-tile group/tile focus-visible:ring-accent-game focus-visible:ring-offset-background text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-[translate] motion-safe:hover:-translate-y-0.5"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static file under /public, served as is (docblock). */}
      <img
        src={art.src}
        alt=""
        width={art.width}
        height={art.height}
        loading="eager"
        decoding="async"
        fetchPriority="low"
        className="home-tile-art"
      />
      <ArrowUpRightIcon
        className="home-tile-arrow text-primary-foreground/80 group-hover/tile:text-primary-foreground size-5"
        aria-hidden
      />
      <span className="type-section">{name}</span>
      <span className="type-label-sm text-primary-foreground/85">{format}</span>
    </Link>
  );
}

export default async function Home() {
  const [userId, topCommanders, finishLeaders] = await Promise.all([
    getSessionUserId(await headers()),
    loadTopCommanders(POOL_SIZE),
    loadRecentFinishLeaders(GAME_ID.optcg, SHELF_SIZE),
  ]);
  const magic = magicHome(topCommanders, utcDayKey(new Date()));

  return (
    <main id="main" className="w-full flex-1">
      <JsonLd data={websiteJsonLd()} />

      {/* data-slot="home-hero": the home intro's target (HOME-INTRO,
          2026-10-22): the root layout's pre-paint gate and globals.css's rule
          animate this section's h1 and the <p> right after it, once per tab,
          and nothing else in it. The band runs edge to edge (`.home-band`);
          its content sits in the wide container. */}
      <section data-slot="home-hero" className="home-band">
        <div className={cn(CONTAINER_CLASS, "home-band-inner")}>
          <div className="flex flex-col items-start gap-5">
            {/* The same line count in Literata and its metric-matched fallback,
                so the font's arrival never reflows the hero (U5, measured on
                prod at 390: a 50 px shift when the trio's preloads delayed the
                font). `.type-hero` is fluid (36 px at 390, 44 at 768, 56 from
                1333), so the cap is per tier: 9em below md (two lines at 36 px
                in both faces), 12em from md (two at 39 to 46), the column from
                lg (two lines in the half, then in the 5/12 from xl). */}
            <h1 className="type-hero max-w-[9em] text-balance md:max-w-[12em] lg:max-w-none">
              Your next great deck starts here.
            </h1>
            <p className="max-w-xl text-lg text-pretty">
              Keyboard-first deck building for Commander and the One Piece Card Game.{" "}
              <span className="text-muted-foreground block">Free. No account needed.</span>
            </p>
          </div>
          <HeroFan cards={magic.fan} />
        </div>
      </section>

      <div className={CONTAINER_CLASS}>
        {/* The doors row (FRESH-UI-HOME): the one wide door to the chooser
            with Browse under it, and a tile per game straight into that
            game's draft (the same hrefs as the regions' Build buttons below,
            which stay where a visitor reading about a game expects them). */}
        <section aria-label="Start building" className="home-doors">
          <div className="home-doors-build">
            <Button
              size="hero"
              className="justify-between"
              nativeButton={false}
              render={<Link href="/decks/new" />}
            >
              Build a deck
              <ArrowRightIcon data-icon="inline-end" aria-hidden />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              nativeButton={false}
              render={<Link href="/commanders" />}
            >
              Browse commanders
              <ArrowRightIcon data-icon="inline-end" aria-hidden />
            </Button>
          </div>
          <nav aria-label="Choose your game" className="home-tiles">
            <GameTile
              game="mtg"
              href="/decks/new?game=mtg"
              name="Magic: The Gathering"
              format="Commander · 100 cards"
            />
            <GameTile
              game="optcg"
              href="/decks/new?game=optcg"
              name="One Piece Card Game"
              format="Leader + 50 cards"
            />
          </nav>
        </section>

        <GameCard
          className="py-12"
          game="mtg"
          label="Magic: The Gathering · Commander"
          title="Magic: The Gathering"
          headline="Find your next commander."
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
          footer={<OptcgPostureLine className="text-muted-foreground type-meta-multiline mt-6" />}
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
      </div>
    </main>
  );
}
