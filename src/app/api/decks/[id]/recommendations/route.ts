/**
 * /api/decks/[id]/recommendations — the recommendation engine, end-to-end
 * (P3.1). Consumed by the builder's Suggestions panel (P3.2), which fetches
 * once per settled autosave burst; smoke:recommend proves the evidence
 * contract against live data. Read access mirrors the deck GET (owner
 * always; non-owners unless private). Rate-limited per IP (P3.2): the
 * costliest read in the app, reachable on any public deck.
 *
 * `?owned=1` (P3.7) — the engine's collections hook, opt-in: restrict the
 * candidate pool to cards the SESSION user owns any printing of (the
 * Suggestions panel's "only cards I own" toggle — the cheapest real slice
 * of Collection Mode). Honest degradation, never an empty pool: a guest, or
 * a user with no collection, gets the hook OFF and the response says why
 * (`owned.applied` / `owned.reason`). The evidence payload is unchanged —
 * owning a card is a filter, not a reason to recommend it. The owned set
 * is materialized once per request (one join) and passed as the IN list
 * the P3.1 contract expects; a very large collection makes that a long
 * parameter list, which is fine on Postgres and noted in LATER.md.
 *
 * Caching intent: force-dynamic + no-store — output depends on the deck's
 * current cards (mid-edit) and on who is asking (x-deck-token / session for
 * private decks, the collection for ?owned=1), so neither CDN nor browser
 * may cache it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUserId } from "@/lib/auth";
import { ownedIdentityIds } from "@/lib/collection/owned";
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
  /** "1"/"true" opts into the owned-cards filter (session required to mean anything). */
  owned: z.enum(["0", "1", "true", "false"]).optional(),
});

export interface OwnedFilterMeta {
  requested: boolean;
  applied: boolean;
  reason?: "signed-out" | "no-collection";
}

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
    owned: params.get("owned") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const requested = parsed.data.owned === "1" || parsed.data.owned === "true";
  const owned: OwnedFilterMeta = { requested, applied: false };
  let ownedCardIds: ReadonlySet<string> | undefined;
  if (requested) {
    const userId = await getSessionUserId(request.headers);
    if (!userId) {
      owned.reason = "signed-out";
    } else {
      const set = await ownedIdentityIds(userId);
      if (set.size === 0) owned.reason = "no-collection";
      else {
        ownedCardIds = set;
        owned.applied = true;
      }
    }
  }

  const recommendations = await recommendForDeck(deck, {
    maxPriceUsd: parsed.data.budget,
    limit: parsed.data.limit,
    ownedCardIds,
  });

  return NextResponse.json(
    { deckId: deck.id, count: recommendations.length, owned, recommendations },
    { headers: NO_STORE },
  );
}
