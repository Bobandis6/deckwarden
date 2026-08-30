/**
 * PUT/DELETE /api/decks/[id]/bookmark (P2.3) — save/unsave a readable deck
 * to the signed-in viewer's private bookmarks (surfaced on /account only).
 * Same contract as the like route: set-not-toggle, session-only, 401 →
 * 404/403 read gate.
 *
 * Caching intent: dynamic mutation, no-store.
 */
import { NextResponse, type NextRequest } from "next/server";

import { setDeckBookmark } from "@/lib/decks/engagement";
import { requireEngageableDeck } from "@/lib/decks/route-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

async function setBookmark(request: NextRequest, id: string, bookmarked: boolean) {
  const access = await requireEngageableDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const limited = await enforceRateLimit(RATE_LIMITS.deckEngagement(access.userId));
  if (limited) return limited;

  const state = await setDeckBookmark(access.deck.id, access.userId, bookmarked);
  return NextResponse.json(state, { headers: NO_STORE });
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/bookmark">) {
  const { id } = await ctx.params;
  return setBookmark(request, id, true);
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/bookmark">) {
  const { id } = await ctx.params;
  return setBookmark(request, id, false);
}
