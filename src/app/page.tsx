import type { Metadata } from "next";
import Link from "next/link";

import { RecentPublicDecks } from "@/components/deck/recent-public-decks";
import { YourDecks } from "@/components/deck/your-decks";
import { Button } from "@/components/ui/button";
import { JsonLd, websiteJsonLd } from "@/lib/seo/jsonld";

/**
 * The real landing page (P2.8 — beta launch package). Every claim below is a
 * shipped feature, and there are no invented numbers or testimonials (cold-
 * start rule): the only social proof on this page is the recent-public-decks
 * rail, which renders real rows or an honest empty state.
 *
 * Caching intent: force-dynamic since the rail landed (P2.3) — same
 * reasoning as /d and /u: a deck flipped private must vanish from the rail
 * immediately, and the rail is one partial-indexed query
 * (decks_recent_public). The hero is static content riding along; if home
 * render cost ever shows, the escape hatch is revalidate-60 at the price of
 * that privacy lag.
 */
export const dynamic = "force-dynamic";

// Canonical guards against query-string variants; title/description inherit
// from the root layout (P2.6). smoke:seo asserts the canonical and the
// WebSite/SearchAction JSON-LD below.
export const metadata: Metadata = { alternates: { canonical: "/" } };

const FEATURES: Array<{ title: string; body: string; href: string; link: string }> = [
  {
    title: "The Warden checks your work",
    body: "Format legality, color identity, copy limits, and banned cards validated as you build — every flag comes with the reason, not just an ✗.",
    href: "/decks/new",
    link: "Open the builder",
  },
  {
    title: "Combos, surfaced",
    body: "Every commander hub and card page shows its Commander Spellbook combos — staples, curve templates, and budget tiers included — so research and brewing live in one place.",
    href: "/commanders",
    link: "Browse commander hubs",
  },
  {
    title: "Share pages that sell the deck",
    body: "Every deck gets a fast mobile-friendly page with curve, prices, sample opening hands, and a share image that unfurls with your commander's art in Discord.",
    href: "/cards",
    link: "Search every card",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-12 px-4 py-16">
      <JsonLd data={websiteJsonLd()} />

      <section className="flex flex-col items-center gap-5 text-center">
        <p className="text-muted-foreground rounded-full border px-3 py-0.5 text-xs font-medium tracking-wide uppercase">
          Open beta
        </p>
        <h1 className="max-w-2xl text-5xl font-bold tracking-tight text-balance">
          Build a legal Commander deck, fast.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-balance">
          Keyboard-first deck building with live legality checks, combo detection, and share pages
          that unfurl beautifully. Free, and no account needed — your deck exists the moment you
          start typing.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/decks/new" />}>
            Start building
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/commanders" />}
          >
            Browse commanders
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Coming from Moxfield or Archidekt? Paste your list into the builder’s import and it lands
          in seconds. Decks built here follow you into an account whenever you{" "}
          <Link href="/account" className="underline underline-offset-4">
            sign in
          </Link>
          .
        </p>
      </section>

      <section aria-label="What Deckwarden does" className="grid w-full gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex flex-col gap-2 rounded-lg border p-4 text-left">
            <h2 className="text-sm font-semibold">{f.title}</h2>
            <p className="text-muted-foreground flex-1 text-sm">{f.body}</p>
            <Link href={f.href} className="text-sm underline underline-offset-4">
              {f.link}
            </Link>
          </div>
        ))}
      </section>

      <YourDecks />
      <RecentPublicDecks />

      <p className="text-muted-foreground max-w-xl text-center text-sm">
        Magic: The Gathering is first — One Piece is on the roadmap behind the same engine.{" "}
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
