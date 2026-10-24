/**
 * /privacy — what Deckwarden actually holds, stated plainly (P1.8 gate;
 * accounts section added with Better Auth in P2.1; deletion self-serve since
 * P2.8, with contact@deckwarden.gg as the private can't-sign-in fallback —
 * privacy requests must never require a public GitHub post; trued up
 * against the code in S6, SECURITY-AUDIT-report.md L16 and L17). Truth:
 * optional Discord/Google accounts (name, email, avatar URL stored); three
 * functional cookies (the session, its short-lived cached copy, the OAuth
 * state during the hop) and a session record with the IP and user agent,
 * seven days from the last visit; decks with their notes, goals, versions
 * and game journal; created_ip on EVERY deck, cleared after 30 days by the
 * nightly (created-ip-retention.ts); localStorage edit keys; optional
 * Sentry error reports with no cookie, header or IP (S2); nightly backups
 * kept 35 days (backups/retention.ts); the anonymous-deck purge is a
 * policy, worded as one — it runs dry until the owner arms it. Still no
 * ads. Since LATER.md row 313 (2026-10-24) Cloudflare Web Analytics counts
 * page views and page speed: a script from static.cloudflareinsights.com
 * on every page (the root layout) that reports to cloudflareinsights.com
 * the page's URL and referrer without their query strings and fragments,
 * plus timings, and sets no cookie and stores nothing (read in its
 * beacon.min.js); the owner sees totals only. page.test.tsx pins the field
 * groups and that the untrue sentences stay gone.
 *
 * Caching intent: fully static (no dynamic APIs, no data fetching).
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Deckwarden stores, and what it deliberately doesn't.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main id="main" className="max-w-reading mx-auto w-full flex-1 px-4 py-12 text-sm">
      <h1 className="type-title">Privacy</h1>
      <p className="text-muted-foreground mt-2">
        Deckwarden has optional sign-in and no ads. Cookies exist only to sign you in and keep you
        signed in. Page views and page speed are counted by Cloudflare Web Analytics, which sets no
        cookies and does not follow you across sites. This page lists everything Deckwarden does
        store.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="type-section">Accounts (optional)</h2>
        <p>
          You never need an account to build, share, or browse. Signing in just keeps your decks
          across browsers. Sign-in is via Discord or Google only; there are no passwords here. From
          the provider we store your display name, email address, and avatar URL, used solely to
          show you your account and tie your decks to it, never for marketing, and never shared. The
          avatar URL is refreshed each time you sign in; your name and email are not.
        </p>
        <p>
          You can also choose a different picture on the account page. Then we store that choice:
          for a Magic card’s art, the card’s name, which printing the art comes from, and the
          artist’s name for the credit line; or simply that you chose your initial. Nothing is
          uploaded.
        </p>
        <p>
          Choosing a username is optional and is the one thing that makes any of that public: it
          publishes a profile page at /u/&lt;username&gt; showing your display name, your picture
          (with its artist credit when it is card art), and your public decks and folders. Never
          your email. Skip the username and nothing about your account is browsable.
        </p>
        <p>
          Importing a collection is optional too. If you upload a ManaBox or Moxfield CSV export on
          the account page, the file is read in your browser and only three things per line reach
          our servers: which card printing, its finish, and how many. Purchase prices, conditions,
          languages, and binder names are never sent. The collection is private. It only ever shows{" "}
          <em>you</em> which cards you own in decks you view, and you can wipe it from the account
          page at any time.
        </p>
        <p>
          While signed in, a session cookie keeps you signed in, beside a short-lived cached copy of
          it that saves a database read on each page; during the Discord or Google sign-in hop a
          state cookie guards the round trip and ends with it. All three are strictly functional,
          and no other cookie is set. Each sign-in also creates a session record on our servers with
          the IP address and browser identifier (user agent) it was made from; a session expires
          after seven days without a visit, and signing out or deleting your account removes it.
          Decks built on a browser before signing in are attached to your account when you sign in
          on that browser; their localStorage edit keys are retired in the process.
        </p>
        <p>
          You can delete your account yourself from the{" "}
          <Link href="/account" className="underline">
            account page
          </Link>
          . It immediately removes your account and everything in it from the live site: decks (with
          their saved versions and the games you logged), folders, likes, bookmarks, sessions, and
          your imported collection. A copy can remain in a nightly backup for up to 35 days (see
          Backups below). If you can no longer sign in, email{" "}
          <a href="mailto:contact@deckwarden.gg" className="underline">
            contact@deckwarden.gg
          </a>{" "}
          instead and removal is handled manually and privately, not through a public issue tracker.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="type-section">Decks you build</h2>
        <p>
          Decks are stored on our servers: the card list, deck name, description, the primer notes
          you write, the goals you set (a target bracket and your answers about the deck), the saved
          versions you keep, and visibility (public, unlisted, or private). Folders store their
          name, description, and visibility. If you keep a game journal (signed in only), each game
          you log stores its date, result, number of players, the deck list you played, and any
          details you add: the turn it ended, your seat, the table’s bracket, notes. Your games are
          visible only to you. Anyone you give a share link can view a public or unlisted deck.
          That’s the point of the link. Private decks are viewable only from the browser that
          created them or by the signed-in account that owns them.
        </p>
        <p>
          The edit key for each deck lives in your browser’s localStorage (not a cookie, so it is
          never sent automatically). Clearing site data deletes your edit keys, and without a key a
          deck can no longer be edited or deleted from your browser, so export anything you care
          about first.
        </p>
        <p>
          You can delete a deck yourself from the editor at any time; deletion is immediate on the
          live site and takes the deck’s versions and logged games with it, and a copy can remain in
          a nightly backup for up to 35 days. We may delete anonymous decks that were left empty for
          30 days or untouched for 12 months.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="type-section">IP addresses</h2>
        <p>
          When a deck is created, signed in or not, we record the creating IP address for spam
          control and abuse cleanup, and nightly housekeeping clears it 30 days later. Rate-limit
          counters keyed by IP are kept for at most two days. A sign-in session records the IP
          address it was made from (see Accounts). Cloudflare sees it with each analytics report
          (see Analytics). Our hosting providers keep standard server logs.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="type-section">Analytics</h2>
        <p>
          Every page loads a small script from Cloudflare Web Analytics that counts page views and
          measures how fast pages load. Your browser fetches it from static.cloudflareinsights.com
          and sends its report to cloudflareinsights.com: the page’s address and the address of the
          page that linked you there, both cut off before any “?” or “#” so your searches are not
          sent, plus performance measurements such as how long the page took to load and respond.
          Like any request, the report carries your IP address and browser identifier (user agent);
          Cloudflare uses them for its country, browser, and device counts, and says it does not use
          them to fingerprint you or follow you across sites. The script sets no cookies and stores
          nothing in your browser. We see totals only (page views, visits, referring sites,
          countries, pages, devices, and page speed), never an individual visitor or an IP address.
          What Cloudflare keeps is governed by{" "}
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            Cloudflare’s privacy policy
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="type-section">Error reporting</h2>
        <p>
          When something breaks, an error report (what failed, where in the code, and the failing
          URL) may be sent to Sentry, our error-monitoring service, so we can fix it. Reports from
          our servers are sent without cookies, request headers, or your IP address. Error reports
          are not used for anything else.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="type-section">Backups</h2>
        <p>
          Every night we back up the account and deck tables (never sign-in tokens or sessions) to
          Cloudflare R2, where they are encrypted at rest. Backups are kept for 35 days and then
          deleted, so anything you delete can persist in a backup for up to 35 days. They exist only
          to restore the site after data loss and are never read for anything else.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="type-section">Where things run</h2>
        <p>
          Hosting is on Vercel, the database on Neon (US region), backups on Cloudflare R2, and
          analytics on Cloudflare Web Analytics. Magic card images load directly from Scryfall’s
          CDN, so your browser makes requests to scryfall.io when viewing cards, governed by{" "}
          <a
            href="https://scryfall.com/docs/privacy"
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            Scryfall’s privacy policy
          </a>
          . One Piece card images load from our own image host, img.deckwarden.gg.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="type-section">Questions or removal requests</h2>
        <p>
          Email{" "}
          <a href="mailto:contact@deckwarden.gg" className="underline">
            contact@deckwarden.gg
          </a>{" "}
          for anything private, or{" "}
          <a
            href="https://github.com/Bobandis6/deckwarden/issues"
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            open a GitHub issue
          </a>{" "}
          for bugs. Either way we’ll sort it out. Attribution and terms live on the{" "}
          <Link href="/legal" className="underline">
            legal page
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
