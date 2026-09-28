/**
 * GET /api/cards/suggest?game=mtg|optcg&scope=cards|leaders&q=… — the
 * predictive name dropdown (X2, WAVE3.md D2) behind the /commanders,
 * /leaders and /cards boxes. Answers `{ q, results }`: the normalized text
 * and at most 8 slim rows `{ id, name, slug, isLeader, typeLine, colorsMask,
 * ciMask, externalKey, image }`, ranked by the shared matcher
 * (src/lib/search/name-match.ts) — the statements live in
 * src/lib/search/suggest.ts.
 *
 * Deliberately NOT /api/cards/search with a small limit: a search row
 * carries the card's full rules text and no hub slug, and its order is
 * similarity; the editor's list rides that route's default order and must
 * not move.
 *
 * Caching intent: dynamic rendering (query-string driven) with
 * `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` —
 * card names change once a night (the ingest), so the edge answers every
 * repeat of a URL for an hour and serves a stale copy while it refreshes.
 * The island sends the text already normalized, so "Sol", "sol" and "sol "
 * are one cache key. Fewer than two normalized characters is an empty 200
 * with no query — carrying the same header, since it is the same answer
 * for that URL every time.
 *
 * Statements: one; two only when the trigram pass (class 5) runs; none for
 * the empty answer. No rate limit (WAVE3.md A, LATER row 118): the edge
 * absorbs repeats, and a limiter would cost a database write per uncached
 * request — more than the 1–2 ms query it guards.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { loadSuggestions } from "@/lib/search/suggest";

export const dynamic = "force-dynamic";

const QUERY = z.object({
  game: z.enum(["mtg", "optcg"]).default("mtg"),
  scope: z.enum(["cards", "leaders"]).default("cards"),
  q: z.string().max(200).default(""),
});

// Not exported: a route module may only export Next's route fields.
const SUGGEST_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: NextRequest) {
  const parsed = QUERY.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = await loadSuggestions(getDb(), parsed.data);
  return NextResponse.json(body, { headers: { "Cache-Control": SUGGEST_CACHE_CONTROL } });
}
