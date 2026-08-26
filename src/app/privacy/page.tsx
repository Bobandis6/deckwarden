/**
 * /privacy — what Deckwarden actually holds, stated plainly (P1.8 gate).
 * v1 truth: no accounts, no cookies, no analytics; anon decks + created_ip +
 * localStorage edit keys + optional Sentry error reports.
 *
 * Caching intent: fully static (no dynamic APIs, no data fetching).
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Deckwarden stores, and what it deliberately doesn't.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="text-muted-foreground mt-2">
        Deckwarden currently has no accounts, no cookies, no ads, and no analytics. This page lists
        everything it does store.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Decks you build</h2>
        <p>
          Decks are stored on our servers: the card list, deck name, description, and visibility
          (public, unlisted, or private). Anyone you give a share link can view a public or unlisted
          deck — that’s the point of the link. Private decks are viewable only from the browser that
          created them.
        </p>
        <p>
          The edit key for each deck lives in your browser’s localStorage (not a cookie — it is
          never sent automatically). Clearing site data deletes your edit keys, and without a key a
          deck can no longer be edited or deleted from your browser, so export anything you care
          about first.
        </p>
        <p>
          You can delete a deck yourself from the editor at any time; deletion is immediate and
          permanent. Housekeeping also deletes anonymous decks left empty for 30 days or untouched
          for 12 months.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">IP addresses</h2>
        <p>
          When a deck is created we record the creating IP address, used only for spam control and
          abuse cleanup. Rate-limit counters keyed by IP are kept for at most two days. Our hosting
          providers keep standard server logs.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Error reporting</h2>
        <p>
          When something breaks, an error report (stack trace, browser version, the failing URL, and
          possibly your IP address) may be sent to Sentry, our error-monitoring service, so we can
          fix it. Error reports are not used for anything else.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Where things run</h2>
        <p>
          Hosting is on Vercel, the database on Neon (US region), and encrypted backups on
          Cloudflare R2. Card images load directly from Scryfall’s CDN, so your browser makes
          requests to scryfall.io when viewing cards — governed by{" "}
          <a
            href="https://scryfall.com/docs/privacy"
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            Scryfall’s privacy policy
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Questions or removal requests</h2>
        <p>
          <a
            href="https://github.com/Bobandis6/deckwarden/issues"
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            Open a GitHub issue
          </a>{" "}
          and we’ll sort it out. Attribution and terms live on the{" "}
          <Link href="/legal" className="underline">
            legal page
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
