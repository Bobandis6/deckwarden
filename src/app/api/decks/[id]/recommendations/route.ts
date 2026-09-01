/**
 * /api/decks/[id]/recommendations — the recommendation engine, end-to-end
 * (P3.1). DARK: no UI calls this yet — P3.2's builder panel is the consumer;
 * it exists so the engine is provable against real data (smoke:recommend)
 * and so P3.2 starts from a working API. Read access mirrors the deck GET
 * (owner always; non-owners unless private).
 *
 * Caching intent: force-dynamic + no-store — output depends on the deck's
 * current cards (mid-edit) and on who is asking (x-deck-token / session for
 * private decks), so neither CDN nor browser may cache it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { MAX_LIMIT, recommendForDeck } from "@/lib/recommend/engine";
import { requireReadableDeck } from "@/lib/decks/route-helpers";

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
