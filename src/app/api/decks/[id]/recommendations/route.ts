/**
 * /api/decks/[id]/recommendations — the recommendation engine, end-to-end
 * (P3.1). Consumed by the builder's Suggestions panel (P3.2), which fetches
 * once per settled autosave burst; smoke:recommend proves the evidence
 * contract against live data. Read access mirrors the deck GET (owner
 * always; non-owners unless private). Rate-limited per IP (P3.2): the
 * costliest read in the app, reachable on any public deck.
 *
 * Caching intent: force-dynamic + no-store — output depends on the deck's
 * current cards (mid-edit) and on who is asking (x-deck-token / session for
 * private decks), so neither CDN nor browser may cache it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { MAX_LIMIT, recommendForDeck } from "@/lib/recommend/engine";
import { clientIp } from "@/lib/decks/access";
import { requireReadableDeck } from "@/lib/decks/route-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const QUERY = z.object({
  /** Budget in USD: only cards with a known price at or under it. */
  budget: z.coerce.number().positive().max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
});

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/recommendations">,
) {
  const limited = await enforceRateLimit(RATE_LIMITS.recommendations(clientIp(request.headers)));
  if (limited) return limited;

  const { id } = await ctx.params;
  const access = await requireReadableDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const { deck } = access;

  const params = request.nextUrl.searchParams;
  const parsed = QUERY.safeParse({
    budget: params.get("budget") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const recommendations = await recommendForDeck(deck, {
    maxPriceUsd: parsed.data.budget,
    limit: parsed.data.limit,
  });

  return NextResponse.json(
    { deckId: deck.id, count: recommendations.length, recommendations },
    { headers: NO_STORE },
  );
}
