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
 *
 * `sort=best` (X2, REC-2): the /cards grid's order when a name is typed —
 * the ranked name matcher's (src/lib/search/name-match.ts), so the first
 * tile is the dropdown's first row. It changes ONLY the ORDER BY: the WHERE
 * is still the translator's, the rows are the same rows. `dir` is ignored
 * (the rank has one direction), the id pass ignores it like every sort, and
 * with no name to rank it falls back to the default order. Every other
 * request — the editor's list included, which sends no `sort` — is
 * untouched.
 *
 * The set scope (X4a, WAVE3.md D4): a `"set"` field (`set=blb`, Magic only)
 * makes the translator return a scope beside its EXISTS. With a scope, and
 * only then: each row's printing is its lowest-numbered printing IN the set
 * (src/lib/sets/sql.ts `inSetPrintings`, LEFT JOINed where the default
 * printing is otherwise joined), so `image` is that printing's; each row
 * carries that `printingId` on the wire (the /cards tiles link
 * `/cards/<id>?printing=<printingId>`); and `sort=number` orders the cards by
 * that printing's collector number (`dir` ignored, like `best`; without a
 * scope it falls back to the default order). A scoped request is one
 * statement (two with `format`); when it finds nothing, ONE more asks the
 * sets table why, so an unknown, digital-only or unreleased code answers an
 * honest empty result with a warning. Without a set the SQL, the rows and
 * the bytes are what they were — the default order, the row shape and the
 * One Piece id pass included (pinned by route.test.ts).
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
import { nameFieldKey, nameMatchOrder, parseNameQuery } from "@/lib/search/name-match";
import { translateSearch, type SearchTranslation } from "@/lib/search/translate";
import { loadSetStatus, type SetStatus } from "@/lib/sets/queries";
import { collectorNumberOrder, inSetPrintings } from "@/lib/sets/sql";

export const dynamic = "force-dynamic";

const { cardIdentities: ci, cardPrintings: cp } = schema;

const QUERY = z.object({
  game: z.enum(["mtg", "optcg"]).default("mtg"),
  /** When present, results carry legality exceptions for this format (P1.4). */
  format: z.string().max(40).optional(),
  sort: z.enum(["relevance", "name", "mv", "price", "pop", "best", "number"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

/** Why a scoped request found nothing — the warning's words, per the sets row. */
const SET_STATUS_WARNING: Record<Exclude<SetStatus, "released">, (code: string) => string> = {
  unknown: (code) => `no set has the code "${code}"`,
  digital: (code) => `"${code}" is a digital-only set`,
  unreleased: (code) => `"${code}" is not released yet`,
};

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
  const translation: SearchTranslation =
    idPrefix !== null
      ? { conditions: [sql`${ci.externalKey} LIKE ${idPrefix + "%"}`], rank: null, warnings: [] }
      : translateSearch(adapter.searchFields, params);
  const { conditions, rank, warnings, scope } = translation;

  // X4a: the set's printing of every card, only when scoped (docblock).
  const inSet = scope ? inSetPrintings(GAME_ID[game], scope.code) : null;

  // `best` ranks by the typed name (docblock); with no name it is the default order.
  // `number` orders by the in-set printing; with no set it is the default order.
  const nameField = nameFieldKey(adapter.searchFields);
  const bestQuery = sort === "best" && nameField ? parseNameQuery(params[nameField]) : null;
  const defaultKey = rank ? "relevance" : "pop";
  const orderKey =
    sort === "best"
      ? bestQuery
        ? "best"
        : defaultKey
      : sort === "number"
        ? inSet
          ? "number"
          : defaultKey
        : (sort ?? defaultKey);
  const direction = dir ?? (orderKey === "relevance" ? "desc" : "asc");
  const dirSql = direction === "desc" ? sql`DESC` : sql`ASC`;
  const ORDERS: Record<string, SQL> = {
    relevance: rank ? sql`${rank} ${dirSql}` : sql`${ci.popularity} ASC NULLS LAST`,
    name: sql`${ci.nameNorm} ${dirSql}`,
    mv: sql`${ci.costValue} ${dirSql} NULLS LAST`,
    price: sql`${ci.cheapestUsd} ${dirSql} NULLS LAST`,
    pop: sql`${ci.popularity} ${dirSql} NULLS LAST`,
    ...(bestQuery ? { best: sql.join(nameMatchOrder(bestQuery), sql`, `) } : {}),
    ...(inSet
      ? { number: sql.join(collectorNumberOrder(inSet.collectorNumber, inSet.id), sql`, `) }
      : {}),
  };
  const orderBy = idPrefix !== null ? sql`${ci.externalKey} ASC` : ORDERS[orderKey];

  // The card's columns, in the wire's key order — shared by both branches.
  const cardFields = {
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
  };
  const total = sql<number>`count(*) over()::int`;
  const where = and(eq(ci.gameId, GAME_ID[game]), eq(ci.isRemoved, false), ...conditions);

  const db = getDb();
  const rows = inSet
    ? await db
        .select({
          ...cardFields,
          printingId: inSet.id,
          imageOverride: inSet.imageOverride,
          total,
        })
        .from(ci)
        .leftJoin(inSet, eq(inSet.cardIdentityId, ci.id))
        .where(where)
        .orderBy(orderBy, ci.nameNorm)
        .limit(limit)
        .offset(offset)
    : await db
        .select({
          ...cardFields,
          printingId: cp.id,
          imageOverride: cp.imageOverride,
          total,
        })
        .from(ci)
        .leftJoin(cp, and(eq(cp.cardIdentityId, ci.id), eq(cp.isDefault, true)))
        .where(where)
        .orderBy(orderBy, ci.nameNorm)
        .limit(limit)
        .offset(offset);

  // X4a: an empty scoped answer says why when the code is the reason.
  if (scope && rows.length === 0) {
    const status = await loadSetStatus(GAME_ID[game], scope.code);
    if (status !== "released") {
      warnings.push(`${scope.field}: ${SET_STATUS_WARNING[status](scope.code)}`);
    }
  }

  const totalRows = rows[0]?.total ?? 0;
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
      // X4a: the in-set printing rides the wire only when scoped, so an
      // unscoped response stays byte-identical.
      ...(scope ? { printingId } : {}),
    }),
  );

  return NextResponse.json(
    { results, total: totalRows, limit, offset, ...(warnings.length ? { warnings } : {}) },
    // Nightly-changing data: let the CDN serve repeats for 5 min, revalidate in background.
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
