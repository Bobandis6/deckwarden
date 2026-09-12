/**
 * /decks/[id]/edit (P1.2): the deck editor.
 *
 * Caching intent: dynamic. The page is a thin server shell around the
 * client-heavy editor; all deck data is fetched client-side with no-store
 * because ownership proof (the claim token) lives in the browser's
 * localStorage and never reaches the server render.
 */
import type { Metadata, Viewport } from "next";

import { DeckEditor } from "@/components/editor/deck-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deck editor",
  // Belt-and-suspenders with robots.txt's /decks/ disallow (P2.6).
  robots: { index: false },
};

// The editor's viewport (R4) — the same export as /decks/new; see it for why.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function DeckEditPage({ params }: PageProps<"/decks/[id]/edit">) {
  const { id } = await params;
  // No site header on editor routes: the editor renders its own (R3), with
  // the appearance menu in it — one appearance control per page.
  return <DeckEditor deckId={id} />;
}
