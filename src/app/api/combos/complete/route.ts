/**
 * GET /api/combos/complete?game=mtg&ids=<sorted, comma-joined card ids> —
 * the bracket read's combo facts (Y4a, WAVE4 D5): `{ combos, freshness }`,
 * the core loaders and nothing more. `combos` is loadCompleteCombos over the
 * id set (one statement: every combo whose card pieces are all in the set,
 * uncapped — a combo's identity is its pieces' union, so no color filter);
 * `freshness` is loadBracketFreshness (one statement: each source's latest
 * successful ingest run, judged by the adapter). The editor computes the
 * read client-side from these and the card wires it already holds.
 *
 * Keyed by the id SET, never a deck: drafts, private decks and (Y5) share
 * pages ask the same way, with no token, and nothing is written — a GET,
 * so the editor's zero-POST pins for seeded drafts hold. The answer
 * depends only on the set and the nightly data.
 *
 * One URL per set: `game` then `ids`, nothing else; at most 200 ids, each a
 * lowercase uuid, sorted and unique (src/lib/brackets/facts.ts builds it).
 * Any other spelling — unsorted, a duplicate, an extra or repeated
 * parameter, another order — answers 400 rather than a second cache entry
 * for the same set. The check reads the parsed parameters, never the raw
 * query string: Next's server re-serializes the query before a handler
 * runs (a comma arrives as `%2C`), so a byte comparison would refuse every
 * real request — measured on dev — and an encoded comma reads the same as
 * the client's literal one. A game without a bracket read (One Piece)
 * answers 400: an API, no apology.
 *
 * Caching intent: dynamic rendering with an hour at the edge and a day of
 * stale-while-revalidate (X3's combo route) — combo and ingest data move
 * nightly at most, and a staleness judged up to a day late can't matter to
 * a 7-day window. Rate-limited per IP in its own bucket
 * (RATE_LIMITS.comboFacts) before anything is parsed: an edge HIT never
 * reaches it, but every uuid-shaped set is a fresh URL, so a walk through
 * sets would otherwise reach Neon unmetered (X3's route needs no bucket
 * because its keys are real ones). Errors carry no cache header.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FACTS_ID, FACTS_MAX_IDS, factsPath } from "@/lib/brackets/facts";
import { loadBracketFreshness } from "@/lib/brackets/freshness";
import { loadCompleteCombos } from "@/lib/combos/queries";
import { clientIp } from "@/lib/decks/access";
import { getAdapter } from "@/lib/games/registry";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

const QUERY = z.object({
  game: z.enum(["mtg", "optcg"]),
  ids: z
    .string()
    .min(1)
    .transform((s) => s.split(","))
    .pipe(z.array(z.string().regex(FACTS_ID)).max(FACTS_MAX_IDS)),
});

const bad = (error: string, issues?: unknown) =>
  NextResponse.json(issues ? { error, issues } : { error }, { status: 400 });

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(RATE_LIMITS.comboFacts(clientIp(request.headers)));
  if (limited) return limited;

  const query = QUERY.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return bad("Invalid query", query.error.issues);
  const { game, ids } = query.data;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i - 1] >= ids[i]) return bad("ids must be sorted and unique");
  }
  // The one spelling per set: game, then ids, nothing else.
  if ([...request.nextUrl.searchParams.keys()].join("&") !== "game&ids") {
    return bad(`Ask in the canonical form: ${factsPath(game, ["<id>", "…"])}`);
  }

  const adapter = getAdapter(game);
  if (!adapter.brackets) return bad("No bracket read for this game");

  const combos = await loadCompleteCombos(ids);
  const freshness = await loadBracketFreshness(adapter);
  return NextResponse.json({ combos, freshness }, { headers: CACHE });
}
