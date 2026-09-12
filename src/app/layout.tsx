import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { siteOrigin } from "@/lib/seo/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Two-game identity (P4.6, the OP beta): "Commander deck builder" stays a
// literal substring — the phrase the MTG side is indexed under — with One
// Piece added beside it, not replacing it. Per-page titles ride the template
// unchanged, so /c/'s ~4k indexed titles do not move.
const DESCRIPTION =
  "Build, analyze, and share Magic: The Gathering Commander and One Piece Card Game decks — no account needed.";
const SITE_TITLE = "Deckwarden — Commander & One Piece deck builder";

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* No footer here since R4: the (site) layout renders it for every
            public page, the headerless shells outside the group (the new-deck
            picker, the root 404, the error page) render it themselves, and
            the editor routes carry a compact attribution line instead. */}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
