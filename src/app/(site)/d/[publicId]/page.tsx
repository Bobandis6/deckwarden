/**
 * /d/[publicId] — the public deck share page (P1.7).
 *
 * Caching intent: force-dynamic (SSR per request, no ISR). Chosen
 * deliberately over `revalidate`: a visibility flip to private must take
 * effect immediately — an ISR-cached page would keep serving the full deck
 * HTML for up to the revalidation window after the owner locked it down,
 * which is a privacy bug, and decks are usually shared seconds after their
 * last autosave, when a cached copy would be stale anyway. "Fast read page"
 * (P1.8 gate) is met by indexed queries with no auth wall; tag-based
 * revalidation is the P1.8+ upgrade path if render cost ever shows.
 *
 * Statements (DB_LOG on dev, signed out, measured Y5 — the layout's 404
 * gate shares the deck lookup): the deck 1, the cards wire 2–3 (the cards,
 * their legalities, and the default printings unless every card has a
 * chosen one), the author 1 for an account deck, the precon 1 for a
 * precon, the leader art 1 when the art leader has no chosen printing, and
 * — Y5, a Magic list with a commander — the bracket facts 2
 * (loadBracketFreshness + loadCompleteCombos, in the second batch). So a
 * public account Magic deck is 8 (6 before Y5), a precon 6 (4), a One
 * Piece deck 5 and a Magic list without a commander 4 (unchanged), the
 * private gate 1. Signed in adds engagement 1 and the collection check 1;
 * a fork adds its credit 1.
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

import { DeckShareView, type ShareBracketFacts } from "@/components/deck/deck-share-view";
import { OptcgPostureLine } from "@/components/optcg-posture-line";
import { PrivateShareGate } from "@/components/deck/private-share-gate";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/auth";
import { FACTS_MAX_IDS, factsIds } from "@/lib/brackets/facts";
import { loadBracketFreshness } from "@/lib/brackets/freshness";
import { shareGoals } from "@/lib/brackets/table";
import { deckOwnedForViewer } from "@/lib/collection/owned";
import { deckOwnership } from "@/lib/collection/ownership";
import { loadCompleteCombos } from "@/lib/combos/queries";
import { isDeckOwner } from "@/lib/decks/access";
import { fetchDeckCardsWire } from "@/lib/decks/deck-cards-wire";
import { viewerEngagement } from "@/lib/decks/engagement";
import { forkCredit } from "@/lib/decks/forks";
import { readGoals } from "@/lib/decks/goals";
import { loadDeckLeaderArt } from "@/lib/decks/leader-art";
import { hasLeader } from "@/lib/decks/panel-view";
import { loadPreconByDeckId } from "@/lib/decks/precons";
import { deckFormat } from "@/lib/decks/route-helpers";
import { deckMetaJson } from "@/lib/decks/serialize";
import { deckJsonLd, JsonLd } from "@/lib/seo/jsonld";

export const dynamic = "force-dynamic";

// One DB lookup shared by the layout (the 404 gate, R6), generateMetadata and the page render.
import { getDeck } from "./deck";

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
  const [cards, author, viewer, forkedFrom, precon] = await Promise.all([
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
    // Fork credit (P3.6) for THIS viewer: a private upstream credits
    // without name or link, except to someone who can read it.
    forkCredit(deck, { token: null, userId: sessionUserId }),
    // Product chrome (W8b): the precon_products join is the test — never
    // the `p_` prefix. Null for every user deck.
    deck.kind === "precon" ? loadPreconByDeckId(deck.id) : Promise.resolve(null),
  ]);
  const fmt = deckFormat(deck);
  // The bracket read's facts (Y5, WAVE4 D6): a Magic list with a commander
  // asks for them here, in the second batch — the freshness read and the
  // complete combos for the list's id set, the same two loaders the facts
  // route answers from. Past FACTS_MAX_IDS distinct cards the combos aren't
  // asked ("over": the read says it couldn't check them). A load that fails
  // is left to the client, which asks the facts route like the editor.
  const ids = factsIds(cards);
  const bracketsOn = fmt?.adapter.brackets !== undefined && hasLeader(cards, fmt.format);
  const over = ids.length > FACTS_MAX_IDS;
  // "You own N/100 · missing ≈ $Y" (P3.7) — the signed-in viewer's OWN
  // collection against this deck, computed server-side like viewerEngagement
  // and rendered only when they have imported one. Signed out: nothing.
  // Alongside it, the art leader's crop (R2): resolved here so the page
  // ships with it and the client never asks; a game without ambient art
  // (One Piece) resolves to null before any lookup.
  const [ownedInfo, art, freshness, combos] = await Promise.all([
    sessionUserId
      ? deckOwnedForViewer(
          sessionUserId,
          cards.map((c) => c.cardId),
        )
      : Promise.resolve(null),
    fmt ? loadDeckLeaderArt(deck, cards, fmt) : Promise.resolve(null),
    bracketsOn && fmt
      ? loadBracketFreshness(fmt.adapter).catch(() => undefined)
      : Promise.resolve(undefined),
    bracketsOn && !over ? loadCompleteCombos(ids).catch(() => undefined) : Promise.resolve(null),
  ]);
  const bracketFacts: ShareBracketFacts | undefined = !bracketsOn
    ? undefined
    : freshness === undefined || combos === undefined
      ? { from: "client" }
      : { from: "server", state: over ? "over" : "ready", combos, freshness };
  // What of the owner's goals the page shows (Y5): the target and the
  // exceptions, and — computed here from the full row, so nothing else
  // leaves the server — the answers the read used (goals.ts' tableGoals).
  // For the owner too: the page shows what the pod sees. Without the
  // server's facts no answer is shown (they can't be told apart).
  const shownGoals = shareGoals({
    fmt: fmt ?? null,
    cards,
    goals: readGoals(deck.goals),
    facts: bracketFacts?.from === "server" ? bracketFacts : null,
  });
  const owned = ownedInfo?.hasCollection ? new Set(ownedInfo.owned) : undefined;
  const ownership =
    owned && fmt
      ? deckOwnership(cards, new Map(cards.map((c) => [c.cardId, c.card])), owned, fmt.format)
      : null;
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
        deck={{
          ...deckMetaJson(deck, { isOwner: isDeckOwner(deck, null, sessionUserId) }),
          goals: shownGoals,
        }}
        cards={cards}
        author={author}
        viewer={viewer}
        forkedFrom={forkedFrom}
        ownership={ownership}
        owned={owned}
        art={art}
        precon={precon}
        bracketFacts={bracketFacts}
      />
      {/* An OP deck's share page is a grid of Bandai card images — it needs
          the same posture line as /cards (P4.6); the walked funnel found it
          carrying only the site-wide Scryfall/WotC footer. */}
      {fmt?.adapter.id === "optcg" && (
        <div className="max-w-browse mx-auto w-full px-4">
          <OptcgPostureLine className="text-muted-foreground pb-4 text-xs" />
        </div>
      )}
    </>
  );
}
