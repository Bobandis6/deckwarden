/**
 * PUT/DELETE /api/decks/[id]/like (P2.3) — set/clear the signed-in viewer's
 * like on a readable deck. Set-not-toggle so retries and double-clicks are
 * idempotent; the response is the authoritative state the button reconciles
 * to. Session-only: likes are account actions (guests see counts, can't
 * vote), so 401 signed out, then the 404/403 read contract.
 *
 * Caching intent: dynamic mutation, no-store.
 */
import { NextResponse, type NextRequest } from "next/server";

import { noStoreJson } from "@/lib/api/json";
import { setDeckLike } from "@/lib/decks/engagement";
import { requireEngageableDeck } from "@/lib/decks/route-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function setLike(request: NextRequest, id: string, liked: boolean) {
  const access = await requireEngageableDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const limited = await enforceRateLimit(RATE_LIMITS.deckEngagement(access.userId));
  if (limited) return limited;

  const state = await setDeckLike(access.deck.id, access.userId, liked);
  return noStoreJson(state);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/like">) {
  const { id } = await ctx.params;
  return setLike(request, id, true);
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/like">) {
  const { id } = await ctx.params;
  return setLike(request, id, false);
}
