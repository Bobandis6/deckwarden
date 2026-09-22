/**
 * GET /api/precons/[slug] — one precon as meta + the share page's wire rows
 * (W8b, WAVE2.md D7): the "Start from this precon" seed source. Public
 * product data only: the lookup starts from precon_products, so a user
 * deck's id or publicId can never resolve here (404), and the slug — not
 * the MTGJSON fileName code — is the one accepted key (the W8b lookup-key
 * decision; the code's uppercase fails the slug grammar and 404s).
 *
 * Caching intent: dynamic rendering with a day at the edge
 * (`s-maxage=86400`) — a precon's list changes only when a W8a re-ingest
 * rewrites it (weekly at most), and the draft seeder tolerates a day of
 * staleness by design. 404s get a shorter miss window so a product added
 * by the next nightly heals within the hour. No rate limit: a GET bounded
 * by real slugs costing three indexed reads is the printings route's
 * shape. (Vercel rewrites the echoed Cache-Control — trust
 * `x-vercel-cache: HIT`, the W5 lesson.)
 */
import { NextResponse, type NextRequest } from "next/server";

import { fetchDeckCardsWire } from "@/lib/decks/deck-cards-wire";
import { loadPreconBySlug } from "@/lib/decks/precons";
import { deckFormat } from "@/lib/decks/route-helpers";

export const dynamic = "force-dynamic";

const HIT_CACHE = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" };
const MISS_CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" };

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/precons/[slug]">) {
  const { slug } = await ctx.params;
  const found = await loadPreconBySlug(slug);
  if (!found) {
    return NextResponse.json({ error: "Precon not found" }, { status: 404, headers: MISS_CACHE });
  }
  const { deck, precon } = found;
  const fmt = deckFormat(deck);
  if (!fmt) {
    return NextResponse.json({ error: "Precon has an unknown format" }, { status: 500 });
  }
  const cards = await fetchDeckCardsWire(deck);
  return NextResponse.json(
    {
      precon,
      deck: {
        publicId: deck.publicId,
        name: deck.name,
        description: deck.description,
        game: fmt.adapter.id,
        format: fmt.format.code,
        leaderIds: deck.leaderIds ?? [],
        ciMask: deck.ciMask,
      },
      cards,
    },
    { headers: HIT_CACHE },
  );
}
