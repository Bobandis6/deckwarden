/**
 * This segment's layout exists for ONE reason (R6, C9): the existence check
 * runs HERE, above the `loading.tsx` Suspense boundary, so an unknown
 * public id still answers a real HTTP 404. Thrown inside the boundary, a
 * `notFound()` renders the Warden page into a streamed 200 — the shell has
 * already been sent (Next's not-found docs: "the resource has to be checked
 * before the response streams"). The lookup is the same React-cached one
 * `generateMetadata` and the page await (`getDeck` in ./deck.ts), so this adds no
 * statement; the layout returns its children untouched. Not a route: the
 * route table is unchanged. Force-dynamic stays the page's call.
 *
 * S6 (SECURITY-AUDIT-report.md L4): a private ACCOUNT deck is a 404 here
 * for every session but its owner's — the same answer an unknown id gets,
 * so a private deck's share link no longer confirms the deck exists. The
 * session read is ./deck.ts's cached one, shared with the page. A private
 * GUEST deck passes through to the page's client gate as before: its proof
 * is a token only the owning browser holds.
 */
import { notFound } from "next/navigation";

import { shareAccess } from "@/lib/decks/share-access";

import { getDeck, getViewer } from "./deck";

export default async function DeckShareLayout({ params, children }: LayoutProps<"/d/[publicId]">) {
  const { publicId } = await params;
  const deck = await getDeck(publicId);
  if (!deck) notFound();
  if (deck.visibility === "private" && shareAccess(deck, await getViewer()) === "not-found") {
    notFound();
  }
  return children;
}
