import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Literata } from "next/font/google";
import "./globals.css";

import { SkipLink } from "@/components/skip-link";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { introScript } from "@/lib/home/intro-gate";
import { siteOrigin } from "@/lib/seo/site";
import { dark } from "@/lib/theme/tokens";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The display face (W1, WAVE2.md D0): Literata carries the wordmark and
// titles through the `font-display` utility. A variable Google font takes
// no `weight` (600/700 come from the CSS that uses it); the optical-size
// axis rides along so small sizes stay sturdy. Self-hosted at build time
// by next/font like the Geists — no runtime request to Google.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

// Two-game identity (P4.6, the OP beta): "Commander deck builder" stays a
// literal substring — the phrase the MTG side is indexed under — with One
// Piece added beside it, not replacing it. Per-page titles ride the template
// unchanged, so /c/'s ~4k indexed titles do not move.
const DESCRIPTION =
  "Build, analyze, and share Magic: The Gathering Commander and One Piece Card Game decks. No account needed.";
const SITE_TITLE = "Deckwarden — Commander & One Piece deck builder";

// One themeColor, one value (W2, D0 "brand details"): the browser chrome
// matches the dark default. The theme is CLASS-based (next-themes), so a
// `prefers-color-scheme` media pair would follow the OS setting, not the
// page's actual theme — deliberately a single value. The token reference
// (dark.background), not a new literal; the editor pages repeat it in their
// own `viewport` exports (R4) so the meta is present regardless of how Next
// merges segment viewports.
export const viewport: Viewport = { themeColor: dark.background };

export const metadata: Metadata = {
  // metadataBase makes OG/canonical URLs absolute. siteOrigin (P2.6) pins
  // production to deckwarden.gg — VERCEL_URL there is the *.vercel.app
  // deployment host, which must never become the canonical origin.
  metadataBase: new URL(siteOrigin()),
  title: { default: SITE_TITLE, template: "%s · Deckwarden" },
  description: DESCRIPTION,
  openGraph: {
    siteName: "Deckwarden",
    type: "website",
    title: SITE_TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes sets the `dark` class (and
    // color-scheme) on <html> from an inline script before React hydrates —
    // the DOM is right, the server markup is not; React must accept the DOM.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${literata.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* No footer here since R4: the (site) layout renders it for every
            public page, the shells outside the group (the new-deck picker,
            the root 404, the error page) render it themselves, and the editor
            routes carry a compact attribution line instead. The site header
            is on every page: the (site) layout's, the root 404's and error
            page's own, and decks/layout.tsx's since 2026-10-17. */}
        {/* The home intro's gate (HOME-INTRO, 2026-10-22; DECKCHECK-STUDY.md
            §2.1): a pre-paint script, the first child of <body> so it runs
            during parsing, before the hero exists and before first paint, and
            in the ROOT layout because a client navigation never re-creates it
            (a page's <script> would be inserted inert on every client return,
            with a development error from React 19). It does nothing off `/`;
            on home's first document load in a tab it sets data-intro="play"
            on <html> (suppressHydrationWarning above covers it, as it does
            next-themes' class) and removes it when the hero's two animations
            have ended. A <script> is not focusable: Skip to content stays the
            first focusable. */}
        <script dangerouslySetInnerHTML={{ __html: introScript() }} />
        {/* Skip to content (U8): the first focusable on every page, editor
            routes included; it targets the page's <main id="main">. */}
        <SkipLink />
        <ThemeProvider>{children}</ThemeProvider>
        {/* Cloudflare Web Analytics (LATER.md row 313, the owner's pick of
            2026-10-23): Cloudflare's JS snippet as issued, the last element
            this layout renders in <body> ("before the ending body tag",
            Cloudflare's setup guide; only Next's own scripts follow it).
            The DNS records are DNS-only, so Cloudflare cannot inject the
            beacon and the page carries it. A plain <script>, not next/script:
            the server HTML carries it, so it loads without waiting for
            hydration (next/script's afterInteractive inserts it after
            hydration and preloads it without CORS, which a module script
            cannot reuse), and in the ROOT layout it runs once per document,
            like the intro gate above. A module script is deferred, so its
            place in <body> changes when it is fetched, never when it runs.
            The beacon counts client navigations itself (History API), sets
            no cookie and stores nothing, and strips the query string and
            fragment from the URLs it sends. The token is public and ships in
            every page; next.config.ts' CSP allows the script's host and the
            host it posts to. No request data is read, so every static page
            stays static. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- a module script is deferred by spec; the rule looks only for async or defer. */}
        <script
          type="module"
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "d20931217390412fba404d4cc52f17dd"}'
        />
      </body>
    </html>
  );
}
