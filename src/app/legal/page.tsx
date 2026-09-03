/**
 * /legal — attribution, fan-content disclaimers, and terms-lite (P1.8 gate).
 *
 * Caching intent: fully static (no dynamic APIs, no data fetching).
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal & attribution",
  description: "Attribution, fan-content disclaimers, and terms for Deckwarden.",
  alternates: { canonical: "/legal" },
};

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Legal &amp; attribution</h1>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Unofficial fan content</h2>
        <p>
          Deckwarden is unofficial Fan Content permitted under the{" "}
          <a
            href="https://company.wizards.com/en/legal/fancontentpolicy"
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            Wizards of the Coast Fan Content Policy
          </a>
          . It is not approved or endorsed by Wizards of the Coast. Portions of the materials used
          are property of Wizards of the Coast. © Wizards of the Coast LLC. Magic: The Gathering and
          its logos are trademarks of Wizards of the Coast LLC.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Card data &amp; images</h2>
        <p>
          Card data, card images, and prices are provided courtesy of{" "}
          <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
            Scryfall
          </a>
          . Scryfall is not affiliated with Deckwarden and does not endorse it. Card data and prices
          on Deckwarden are — and will always remain — free to view without an account or payment.
          Prices are daily estimates, not offers to buy or sell.
        </p>
      </section>

      <section id="one-piece" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">One Piece Card Game data</h2>
        <p>
          ©Eiichiro Oda/Shueisha, Toei Animation. ONE PIECE CARD GAME ©BANDAI. Deckwarden is
          unofficial fan content and is not affiliated with, approved by, or endorsed by Bandai,
          Bandai Namco, Shueisha, or Toei Animation.
        </p>
        <p>
          Being honest about sourcing: no official card-data API exists for the One Piece Card Game.
          Like every One Piece deck-building site, Deckwarden relies on community-maintained
          datasets of the publicly listed card information (we use the open-source{" "}
          <a
            href="https://github.com/buhbbl/punk-records"
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            punk-records
          </a>{" "}
          dataset), and card images come from Bandai&apos;s official card list. We have written to
          Bandai requesting permission for this use. Our posture is simple: full disclaimers, One
          Piece card data and images will never sit behind a paywall or account gate, and any
          takedown request from the rights holders is honored immediately (see Contact below).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Terms of use</h2>
        <p>
          Deckwarden is a free hobby project provided as-is, without warranty of any kind. Don’t
          abuse the service (automated spam, scraping at hostile volume, or attempts to access other
          people’s private decks). Anonymous decks that stay empty for 30 days, or untouched for 12
          months, may be deleted. We may remove content or block abusive traffic to keep the site
          healthy.
        </p>
        <p>
          How your data is handled is described on the{" "}
          <Link href="/privacy" className="underline">
            privacy page
          </Link>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          Questions and takedown requests:{" "}
          <a href="mailto:contact@deckwarden.gg" className="underline">
            contact@deckwarden.gg
          </a>{" "}
          — takedowns are honored immediately. Bug reports are best as a{" "}
          <a
            href="https://github.com/Bobandis6/deckwarden/issues"
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            GitHub issue
          </a>
          .
        </p>
      </section>
    </main>
  );
}
