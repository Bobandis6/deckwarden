/**
 * GET /api/cards/[id]/printings — the gallery's long tail (W5, WAVE2.md D4):
 * `{ printings: GalleryPrinting[], total, truncated }`, newest first, capped
 * at API_PRINTINGS_CAP rows. The card page inlines the first hundred; "Show
 * all" fetches this, and the cap IS the pagination ("Showing 250 of N —
 * newest first"). Slim rows only — the client derives image URLs from the
 * printing id (`imageOverride` rides along when non-null).
 *
 * Order of business: validate the id (400) → the card must exist and not be
 * removed (404) → removed printings are excluded (they don't exist for the
 * gallery, the art route's stance) → newest first through `cp_by_identity`,
 * `id` as the tiebreak so the capped window is deterministic.
 *
 * Caching intent: dynamic rendering with an hour at the edge and a day of
 * stale-while-revalidate — printings change once nightly at ingest, prices
 * too, and an hour of staleness on a gallery tail is invisible. 404s get the
 * miss cache (ids are stable; a card that appears at the next nightly heals
 * within the hour). 400s carry no cache header. No rate limit: a GET bounded
 * by real card ids costing two indexed reads is the art route's shape, not
 * the resolve route's.
 */
import { and, count, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { API_PRINTINGS_CAP, toGalleryPrinting } from "@/lib/cards/printings";

export const dynamic = "force-dynamic";

const PARAMS = z.object({ id: z.uuid() });

const HIT_CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };
const MISS_CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" };

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cards/[id]/printings">) {
  const params = PARAMS.safeParse(await ctx.params);
  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid card id", issues: params.error.issues },
      { status: 400 },
    );
  }

  const { cardIdentities, cardPrintings, sets } = schema;
  const db = getDb();
  const [card] = await db
    .select({ id: cardIdentities.id })
    .from(cardIdentities)
    .where(and(eq(cardIdentities.id, params.data.id), eq(cardIdentities.isRemoved, false)))
    .limit(1);
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404, headers: MISS_CACHE });
  }

  const notRemoved = and(
    eq(cardPrintings.cardIdentityId, card.id),
    eq(cardPrintings.isRemoved, false),
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: cardPrintings.id,
        setCode: sets.code,
        setName: sets.name,
        collectorNumber: cardPrintings.collectorNumber,
        rarity: cardPrintings.rarity,
        releasedAt: cardPrintings.releasedAt,
        isDefault: cardPrintings.isDefault,
        hasBack: cardPrintings.hasBack,
        prices: cardPrintings.prices,
        imageOverride: cardPrintings.imageOverride,
      })
      .from(cardPrintings)
      .innerJoin(sets, eq(sets.id, cardPrintings.setId))
      .where(notRemoved)
      .orderBy(sql`${cardPrintings.releasedAt} desc nulls last`, cardPrintings.id)
      .limit(API_PRINTINGS_CAP),
    db.select({ total: count() }).from(cardPrintings).where(notRemoved),
  ]);

  return NextResponse.json(
    {
      printings: rows.map(toGalleryPrinting),
      total,
      truncated: total > API_PRINTINGS_CAP,
    },
    { headers: HIT_CACHE },
  );
}
