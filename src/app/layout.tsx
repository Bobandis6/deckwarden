import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SiteFooter } from "@/components/site-footer";

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
  // metadataBase makes OG urls absolute; VERCEL_URL covers preview deploys.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://deckwarden.gg"),
  ),
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
