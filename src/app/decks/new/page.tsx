/**
 * /decks/new (P1.2; draft mode since the P2.8 follow-up): the editor with no
 * deck behind it yet. The server row is created lazily by the editor's first
 * real edit — a card added or a name typed — so clicking "Start building" and
 * bouncing leaves nothing on anyone's account (guest or signed-in). Once the
 * first edit lands, the editor swaps the URL to /decks/[id]/edit in place.
 *
 * Caching intent: fully static shell — no data, no params; everything
 * interesting happens client-side in the editor.
 */
import type { Metadata } from "next";

import { DeckEditor } from "@/components/editor/deck-editor";

export const metadata: Metadata = {
  title: "New deck",
  // Belt-and-suspenders with robots.txt's /decks/ disallow (P2.6).
  robots: { index: false },
};

export default function NewDeckPage() {
  return <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" />;
}
