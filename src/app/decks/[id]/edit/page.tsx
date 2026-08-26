/**
 * /decks/[id]/edit (P1.2): the deck editor.
 *
 * Caching intent: dynamic. The page is a thin server shell around the
 * client-heavy editor; all deck data is fetched client-side with no-store
 * because ownership proof (the claim token) lives in the browser's
 * localStorage and never reaches the server render.
 */
import type { Metadata } from "next";

import { DeckEditor } from "@/components/editor/deck-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deck editor",
};

export default async function DeckEditPage({ params }: PageProps<"/decks/[id]/edit">) {
  const { id } = await params;
  return <DeckEditor deckId={id} />;
}
