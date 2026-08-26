/**
 * /d/[publicId] — the public deck share page (P1.7).
 *
 * Caching intent: force-dynamic (SSR per request, no ISR). Chosen
 * deliberately over `revalidate`: a visibility flip to private must take
 * effect immediately — an ISR-cached page would keep serving the full deck
 * HTML for up to the revalidation window after the owner locked it down,
 * which is a privacy bug, and decks are usually shared seconds after their
 * last autosave, when a cached copy would be stale anyway. "Fast read page"
 * (P1.8 gate) is met by rendering off two indexed queries with no auth wall;
 * tag-based revalidation is the P1.8+ upgrade path if render cost ever shows.
 *
 * Access: public/unlisted render server-side. Private decks never have their
 * data embedded in HTML — the RSC hands off to a client gate that fetches the
 * token-authed API, so only the owning browser (claim token in localStorage)
 * can render them; everyone else gets the denial message.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { DeckShareView } from "@/components/deck/deck-share-view";
import { PrivateShareGate } from "@/components/deck/private-share-gate";
import { fetchDeckCardsWire } from "@/lib/decks/deck-cards-wire";
import { loadDeckByPublicId } from "@/lib/decks/route-helpers";
import { deckMetaJson } from "@/lib/decks/serialize";

export const dynamic = "force-dynamic";

// One DB lookup shared by generateMetadata and the page render.
const getDeck = cache(loadDeckByPublicId);

export async function generateMetadata({ params }: PageProps<"/d/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  const deck = await getDeck(publicId);
  if (!deck || deck.visibility === "private") return { title: "Deck" };
  const description = deck.description ?? "A deck shared on Deckwarden.";
  return {
    title: deck.name,
    description,
    // OG basics only — generated share images are P2.6, not built here.
    openGraph: { title: deck.name, description, type: "website" },
  };
}

export default async function DeckSharePage({ params }: PageProps<"/d/[publicId]">) {
  const { publicId } = await params;
  const deck = await getDeck(publicId);
  if (!deck) notFound();

  if (deck.visibility === "private") {
    return <PrivateShareGate deckId={deck.id} />;
  }

  const cards = await fetchDeckCardsWire(deck);
  return <DeckShareView deck={deckMetaJson(deck, { isOwner: false })} cards={cards} />;
}
