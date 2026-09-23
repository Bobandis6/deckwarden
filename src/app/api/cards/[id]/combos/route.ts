/**
 * GET /api/cards/[id]/combos?fit=<mask> — the most-played combos using one
 * card (W9c), straight over loadCombosForCard: the same query the /c/ hub
 * and card pages render server-side, exposed for the editor's "With your
 * commander" rows, which must work in a seeded DRAFT with no deck row
 * (the deck-relative /api/decks/[id]/combos needs one). `fit` is the deck's
 * color-identity mask — combos outside it are no advice. Pieces carry
 * externalKey so "Add N pieces" can hydrate them through resolve's pass 0.
 *
 * Caching intent: dynamic rendering (query-string driven) with an hour at
 * the edge + a day stale-while-revalidate — combo data moves nightly at
 * most, and one URL per (card, fit) keeps the CDN hit rate honest. No rate
 * limit: like the art route, a GET bounded by real ids and edge-cached,
 * costing two indexed reads — not the resolve route's shape. Public card
 * data, never gated (Scryfall/Spellbook no-paywall stance).
 *
 * Unknown ids return an honest empty result (200) rather than 404 — no
 * existence probe, and the empty body is as cacheable as a full one.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { loadCombosForCard } from "@/lib/combos/queries";

export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

const PARAMS = z.object({ id: z.uuid() });
const QUERY = z.object({ fit: z.coerce.number().int().min(0).max(1023).optional() });

export async function GET(request: NextRequest, ctx: RouteContext<"/api/cards/[id]/combos">) {
  const params = PARAMS.safeParse(await ctx.params);
  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid card id", issues: params.error.issues },
      { status: 400 },
    );
  }
  const query = QUERY.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: query.error.issues },
      { status: 400 },
    );
  }

  const { total, combos } = await loadCombosForCard(params.data.id, {
    ...(query.data.fit !== undefined ? { fitCiMask: query.data.fit } : {}),
  });
  return NextResponse.json({ total, combos }, { headers: CACHE });
}
