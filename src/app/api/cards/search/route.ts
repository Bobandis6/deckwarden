/**
 * GET /api/cards/search — card search over the adapter's declared searchFields.
 *
 * Caching intent: dynamic rendering (query-string driven), with CDN caching via
 * Cache-Control s-maxage — card data changes once nightly at ingest, so edge
 * hits absorb repeat queries and keep warm p95 well under the ~150ms budget.
 *
 * Filter params are the adapter's SearchFieldDef keys (grammar documented in
 * src/lib/search/translate.ts). Framework params: game, sort, dir, limit, offset.
 * The route knows nothing game-specific — it asks the registry for the adapter
 * and hands its searchFields to the translator (build plan §3).
 *
 * Quick-add id pass (P4.8): a `name` that is an id-shaped token or prefix
 * (searchIdPrefix — One Piece card numbers; Magic never) skips the translator
 * and runs the SAME select over `external_key LIKE '<prefix>%'`, ordered by
 * external_key (`sort`/`dir` are ignored on this path — card-number order IS
 * the order; the (game_id, external_key) unique index range-scans it under
 * C.UTF-8). A miss returns empty with no trgm arm: an id is not a misspelled
 * name (the resolve route's R5b rule). This is deliberately NOT a declarative
 * `external_key` search field: that would widen the FieldTarget whitelist,
 * grow a fourth match kind for prefixes, and push classification into two
 * clients — the classifier is core and game-branched by `game`, exactly like
 * the resolve route's pass 0 (P4.1's precedent).
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { findFormat, GAME_ID } from "@/db/seed-data";
import { embeddablePrintingImageUrl } from "@/lib/cards/images";
import { searchIdPrefix } from "@/lib/cards/resolve-token";
import { fetchLegalityMap } from "@/lib/decks/legality";
import { getAdapter } from "@/lib/games/registry";
import { translateSearch } from "@/lib/search/translate";

export const dynamic = "force-dynamic";

const { cardIdentities: ci, cardPrintings: cp } = schema;

const QUERY = z.object({
  game: z.enum(["mtg", "optcg"]).default("mtg"),
  /** When present, results carry legality exceptions for this format (P1.4). */
  format: z.string().max(40).optional(),
  sort: z.enum(["relevance", "name", "mv", "price", "pop"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = QUERY.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { game, format, sort, dir, limit, offset } = parsed.data;

  const seededFormat = format ? findFormat(game, format) : undefined;
  if (format && !seededFormat) {
    return NextResponse.json({ error: `Unknown format "${format}" for ${game}` }, { status: 400 });
  }

  const adapter = getAdapter(game);
  // The id pass (docblock above): an id-shaped `name` replaces the
  // translator's conditions with one bound-parameter prefix LIKE. The
  // helper admits only [A-Z0-9-], so the pattern needs no escaping.
  const idPrefix = searchIdPrefix(game, params.name ?? "");
  const { conditions, rank, warnings } =
    idPrefix !== null
      ? { conditions: [sql`${ci.externalKey} LIKE ${idPrefix + "%"}`], rank: null, warnings: [] }
      : translateSearch(adapter.searchFields, params);

  const orderKey = sort ?? (rank ? "relevance" : "pop");
  const direction = dir ?? (orderKey === "relevance" ? "desc" : "asc");
  const dirSql = direction === "desc" ? sql`DESC` : sql`ASC`;
  const ORDERS: Record<string, SQL> = {
    relevance: rank ? sql`${rank} ${dirSql}` : sql`${ci.popularity} ASC NULLS LAST`,
    name: sql`${ci.nameNorm} ${dirSql}`,
    mv: sql`${ci.costValue} ${dirSql} NULLS LAST`,
    price: sql`${ci.cheapestUsd} ${dirSql} NULLS LAST`,
    pop: sql`${ci.popularity} ${dirSql} NULLS LAST`,
  };
  const orderBy = idPrefix !== null ? sql`${ci.externalKey} ASC` : ORDERS[orderKey];

  const db = getDb();
  const rows = await db
    .select({
      id: ci.id,
      name: ci.name,
      externalKey: ci.externalKey,
      primaryType: ci.primaryType,
      costValue: ci.costValue,
      colorsMask: ci.colorsMask,
      ciMask: ci.ciMask,
      cheapestUsd: ci.cheapestUsd,
      popularity: ci.popularity,
      isLeaderCandidate: ci.isLeaderCandidate,
      isPreview: ci.isPreview,
      // Full attrs so results are CardData-shaped (CardWire): the editor hands
      // them to adapter display (pips, subtitle) — and P1.4 validate — as-is.
      attrs: ci.attrs,
      printingId: cp.id,
      imageOverride: cp.imageOverride,
      total: sql<number>`count(*) over()::int`,
    })
    .from(ci)
    .leftJoin(cp, and(eq(cp.cardIdentityId, ci.id), eq(cp.isDefault, true)))
    .where(and(eq(ci.gameId, GAME_ID[game]), eq(ci.isRemoved, false), ...conditions))
    .orderBy(orderBy, ci.nameNorm)
    .limit(limit)
    .offset(offset);

  const total = rows[0]?.total ?? 0;
  const legalityMap = seededFormat
    ? await fetchLegalityMap(
        seededFormat.id,
        rows.map((r) => r.id),
      )
    : new Map();
  const results = rows.map(
    ({ total: _total, printingId, imageOverride, cheapestUsd, ...card }) => ({
      ...card,
      cheapestUsd: cheapestUsd === null ? null : Number(cheapestUsd),
      legality: legalityMap.get(card.id) ?? [],
      image: printingId
        ? embeddablePrintingImageUrl({ id: printingId, imageOverride }, "normal")
        : null,
    }),
  );

  return NextResponse.json(
    { results, total, limit, offset, ...(warnings.length ? { warnings } : {}) },
    // Nightly-changing data: let the CDN serve repeats for 5 min, revalidate in background.
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
