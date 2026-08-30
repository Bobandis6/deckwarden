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
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { DeckShareView } from "@/components/deck/deck-share-view";
import { PrivateShareGate } from "@/components/deck/private-share-gate";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/auth";
import { fetchDeckCardsWire } from "@/lib/decks/deck-cards-wire";
import { viewerEngagement } from "@/lib/decks/engagement";
import { loadDeckByPublicId } from "@/lib/decks/route-helpers";
import { deckMetaJson } from "@/lib/decks/serialize";
import { deckJsonLd, JsonLd } from "@/lib/seo/jsonld";

export const dynamic = "force-dynamic";

// One DB lookup shared by generateMetadata and the page render.
const getDeck = cache(loadDeckByPublicId);

/**
 * Indexing policy (P2.6): only PUBLIC decks are indexable. Unlisted decks
 * keep full metadata + OG image — the Discord unfurl is the share loop —
 * but carry noindex: they're reachable-by-link by design, and letting a
 * crawler that finds a posted link index the page would quietly promote
 * "unguessable URL" to "listed in Google". Private decks expose no data
 * and are noindexed too (the denial shell is not content).
 */
export async function generateMetadata({ params }: PageProps<"/d/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  const deck = await getDeck(publicId);
  if (!deck || deck.visibility === "private") {
    return { title: "Deck", robots: { index: false } };
  }
  const description = deck.description ?? "A deck shared on Deckwarden.";
  return {
    title: deck.name,
    description,
    alternates: { canonical: `/d/${publicId}` },
    // The opengraph-image file convention attaches the generated image.
    openGraph: { title: deck.name, description, type: "website" },
    twitter: { card: "summary_large_image" },
    ...(deck.visibility === "public" ? {} : { robots: { index: false } }),
  };
}

export default async function DeckSharePage({ params }: PageProps<"/d/[publicId]">) {
  const { publicId } = await params;
  const deck = await getDeck(publicId);
  if (!deck) notFound();

  if (deck.visibility === "private") {
    return <PrivateShareGate deckId={deck.id} />;
  }

  // Byline (P2.2): attribution only through a chosen username — picking one
  // is the opt-in that makes name/profile public, so accounts without one
  // stay anonymous here.
  const sessionUserId = await getSessionUserId(await headers());
  const [cards, author, viewer] = await Promise.all([
    fetchDeckCardsWire(deck),
    deck.userId
      ? getDb()
          .select({ name: schema.users.name, username: schema.users.username })
          .from(schema.users)
          .where(eq(schema.users.id, deck.userId))
          .limit(1)
          .then(([u]) => (u?.username ? { name: u.name, username: u.username } : null))
      : Promise.resolve(null),
    // Like/bookmark state (P2.3) — signed-in viewers only; null renders the
    // sign-in affordances with the public count.
    sessionUserId ? viewerEngagement(deck.id, sessionUserId) : Promise.resolve(null),
  ]);
  return (
    <>
      {/* Structured data only where it can be indexed (public decks). */}
      {deck.visibility === "public" && (
        <JsonLd
          data={deckJsonLd({
            name: deck.name,
            description: deck.description,
            publicId: deck.publicId,
            createdAt: deck.createdAt,
            updatedAt: deck.updatedAt,
            authorName: author?.name ?? null,
            authorPath: author?.username ? `/u/${author.username}` : null,
          })}
        />
      )}
      <DeckShareView
        deck={deckMetaJson(deck, { isOwner: false })}
        cards={cards}
        author={author}
        viewer={viewer}
      />
    </>
  );
}
