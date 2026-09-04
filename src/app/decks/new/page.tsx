/**
 * /decks/new (P1.2; draft mode since the P2.8 follow-up; game picker since
 * P4.2): pick a game, then the editor with no deck behind it yet. The server
 * row is created lazily by the editor's first real edit — a card added or a
 * name typed — so clicking around and bouncing leaves nothing on anyone's
 * account (guest or signed-in). Once the first edit lands, the editor swaps
 * the URL to /decks/[id]/edit in place.
 *
 * Caching intent: fully static shell — the game choice is a ?game= search
 * param read CLIENT-side (useSearchParams behind Suspense), so no dynamic
 * rendering; everything interesting happens client-side.
 */
import type { Metadata } from "next";
import { Suspense } from "react";

import { NewDeckChooser } from "./new-deck-chooser";

export const metadata: Metadata = {
  title: "New deck",
  // Belt-and-suspenders with robots.txt's /decks/ disallow (P2.6).
  robots: { index: false },
};

export default function NewDeckPage() {
  return (
    <Suspense fallback={null}>
      <NewDeckChooser />
    </Suspense>
  );
}
