/**
 * GET /api/cards/options — distinct values for an adapter multiselect field
 * declared `options: "distinct-from-db"` (P4.4: the OP traits filter's 171
 * options live in card rows, not in the adapter). Resolves ONLY fields the
 * adapter declares with that sentinel and a single-segment jsonbPath — the
 * same whitelist discipline as translate.ts, so there is no free-form column
 * access here.
 *
 * Caching intent: dynamic rendering (query-string driven) with long CDN
 * caching — the value set changes only at nightly ingest, so a day-stale
 * option list is fine and repeat hits are edge-served.
 */
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { getAdapter } from "@/lib/games/registry";

export const dynamic = "force-dynamic";

const QUERY = z.object({
  game: z.enum(["mtg", "optcg"]).default("mtg"),
  field: z.string().min(1).max(40),
});

export async function GET(request: NextRequest) {
  const parsed = QUERY.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { game, field: fieldKey } = parsed.data;

  const field = getAdapter(game).searchFields.find((f) => f.key === fieldKey);
  if (
    !field ||
    field.kind !== "multiselect" ||
    field.options !== "distinct-from-db" ||
    !("jsonbPath" in field.target)
  ) {
    return NextResponse.json({ error: `No distinct-options field "${fieldKey}"` }, { status: 404 });
  }
  const path = field.target.jsonbPath;
  if (path.length !== 1 || !/^[a-z0-9_]+$/i.test(path[0])) {
    return NextResponse.json({ error: "Field target not resolvable" }, { status: 404 });
  }

  const ci = schema.cardIdentities;
  const rows = await getDb()
    .selectDistinct({ value: sql<string>`jsonb_array_elements_text(${ci.attrs}->${path[0]})` })
    .from(ci)
    .where(sql`${ci.gameId} = ${GAME_ID[game]} AND NOT ${ci.isRemoved}`)
    .orderBy(sql`1`);

  return NextResponse.json(
    { options: rows.map((r) => r.value) },
    // Nightly-changing data: a day at the edge, background revalidate.
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
