/**
 * Web app manifest (W2, WAVE2.md REC-5): home-screen install identity for a
 * phone-capable builder — name, crest icons, dark chrome. Served at
 * /manifest.webmanifest; Next links it from every page's <head>.
 *
 * Caching intent: static — a manifest.ts without dynamic APIs is rendered
 * once at build time (route table `○`), which is right: nothing here reads
 * request state.
 *
 * Icons are committed qlmanage renders of the shield on an opaque #0f1314
 * square (the W1 favicon precedent: committed binaries, no satori route for
 * a static asset) — Android maskable icons want an opaque safe zone anyway.
 * `purpose: "any"` only: declaring `maskable` without a device pass would
 * promise a safe zone nobody verified.
 */
import type { MetadataRoute } from "next";

import { dark } from "@/lib/theme/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deckwarden",
    short_name: "Deckwarden",
    description:
      "Build, analyze, and share Magic: The Gathering Commander and One Piece Card Game decks — no account needed.",
    start_url: "/",
    display: "standalone",
    background_color: dark.background,
    theme_color: dark.background,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
