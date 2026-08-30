import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SiteFooter } from "@/components/site-footer";
import { siteOrigin } from "@/lib/seo/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Build, analyze, and share Magic: The Gathering Commander decks — no account needed.";

export const metadata: Metadata = {
  // metadataBase makes OG/canonical URLs absolute. siteOrigin (P2.6) pins
  // production to deckwarden.gg — VERCEL_URL there is the *.vercel.app
  // deployment host, which must never become the canonical origin.
  metadataBase: new URL(siteOrigin()),
  title: { default: "Deckwarden — Commander deck builder", template: "%s · Deckwarden" },
  description: DESCRIPTION,
  openGraph: {
    siteName: "Deckwarden",
    type: "website",
    title: "Deckwarden — Commander deck builder",
    description: DESCRIPTION,
  },
  twitter: { card: "summary" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
