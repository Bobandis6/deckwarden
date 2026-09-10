/**
 * GET /api/cards/[id]/art?printingId= — the ambient-art descriptor for one
 * card (R2, REDESIGN.md §3): `{ art: CardArt | null }`. The builder asks
 * once per leader change (use-leader-art.ts); server components (the share
 * page, R5b's hub banners) call the resolver directly instead.
 *
 * Order of business: validate the ids (400) → the card must exist and not
 * be removed (404) → the adapter gate: a game that declares no ambient art
 * answers `{ art: null }` right here, before any printing lookup or network
 * (One Piece never reaches Scryfall) → the printing must belong to THIS
 * card and not be removed, the default printing when none is named (404
 * otherwise — a printing another card owns does not exist for this one) →
 * the resolver, which is null when the artist is unknown (attribution rule).
 *
 * Caching intent: dynamic rendering (query-string driven) with a day at
 * the edge on every 200 — art per printing is effectively immutable and the
 * Scryfall call behind it is data-cached daily regardless of who asks — and
 * an hour on 404s (ids are stable; a card that appears at the next nightly
 * heals within the hour). 400s carry no cache header. No rate limit: a GET
 * bounded by real printing ids, edge-cached, costing one indexed read plus a
 * data-cached upstream call is not the resolve route's shape (a POST of up
 * to 400 names per request).
 */
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { gameCodeById } from "@/db/seed-data";
import { ambientArtKind, resolveCardArt } from "@/lib/cards/art";
import { listAdapters } from "@/lib/games/registry";
import { loadDefaultPrinting } from "@/lib/hub/queries";

export const dynamic = "force-dynamic";

const PARAMS = z.object({ id: z.uuid() });
const QUERY = z.object({ printingId: z.uuid().optional() });

const HIT_CACHE = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" };
const MISS_CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" };

export async function GET(request: NextRequest, ctx: RouteContext<"/api/cards/[id]/art">) {
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

  const { cardIdentities, cardPrintings } = schema;
  const db = getDb();
  const [card] = await db
    .select({ id: cardIdentities.id, gameId: cardIdentities.gameId })
    .from(cardIdentities)
    .where(and(eq(cardIdentities.id, params.data.id), eq(cardIdentities.isRemoved, false)))
    .limit(1);
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404, headers: MISS_CACHE });
  }

  // The adapter gate, before any printing lookup: no declared kind, no art.
  const game = gameCodeById(card.gameId);
  const adapter = listAdapters().find((a) => a.id === game);
  if (!adapter || ambientArtKind(adapter) === null) {
    return NextResponse.json({ art: null }, { headers: HIT_CACHE });
  }

  const { printingId } = query.data;
  const printing = printingId
    ? await db
        .select({ id: cardPrintings.id })
        .from(cardPrintings)
        .where(
          and(
            eq(cardPrintings.id, printingId),
            eq(cardPrintings.cardIdentityId, card.id),
            eq(cardPrintings.isRemoved, false),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : await loadDefaultPrinting(card.id);
  if (!printing) {
    return NextResponse.json(
      { error: "Printing not found for this card" },
      { status: 404, headers: MISS_CACHE },
    );
  }

  const art = await resolveCardArt(adapter, printing.id);
  return NextResponse.json({ art }, { headers: HIT_CACHE });
}
