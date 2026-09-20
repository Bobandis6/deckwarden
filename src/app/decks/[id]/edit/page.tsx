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
import { dark } from "@/lib/theme/tokens";

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
  // W2: same single dark value as the root layout (see it for why).
  themeColor: dark.background,
};

export default async function DeckEditPage({
  params,
  searchParams,
}: PageProps<"/decks/[id]/edit">) {
  const { id } = await params;
  // ?leader= (W4): the hub CTA's "Use for …" pick, applied client-side only
  // with a matching sessionStorage intent — the param alone changes nothing.
  const sp = await searchParams;
  const leader = typeof sp.leader === "string" ? sp.leader : undefined;
  // No site header on editor routes: the editor renders its own (R3), with
  // the appearance menu in it — one appearance control per page.
  return <DeckEditor deckId={id} applyLeaderKey={leader} />;
}
