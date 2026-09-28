/**
 * GET /api/sets?game=mtg — the released paper sets of a game (X4a, WAVE3.md
 * D4): the /cards Set picker's list, fetched the first time the picker opens
 * (or at mount when `/cards?set=` arrives preset, to name the chip and the
 * set header). Answers `{ sets }`, newest first, rows of
 * `{ code, name, releasedAt, setType, group, cards, ordinal }` —
 * `loadReleasedSets` (src/lib/sets/queries.ts) in one statement.
 *
 * Caching intent: dynamic rendering (the game is the whole input) with a
 * day at the edge + a day stale-while-revalidate — a set appears on its
 * release date and card counts move nightly at most, so a set released
 * today may join the list up to a day late. No rate limit: one indexed
 * aggregate (~140 ms warm), edge-cached, public data, never gated.
 *
 * A game whose adapter declares no `"set"` field has no set filter, so its
 * list is an honest empty one with no statement (One Piece: its sets carry
 * Bandai labels and no release dates — LATER row 115).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { GAME_ID } from "@/db/seed-data";
import { getAdapter } from "@/lib/games/registry";
import { setFieldKey } from "@/lib/sets/lines";
import { loadReleasedSets } from "@/lib/sets/queries";

export const dynamic = "force-dynamic";

const QUERY = z.object({
  game: z.enum(["mtg", "optcg"]).default("mtg"),
});

export async function GET(request: NextRequest) {
  const parsed = QUERY.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { game } = parsed.data;
  const sets = setFieldKey(getAdapter(game).searchFields)
    ? await loadReleasedSets(GAME_ID[game])
    : [];
  return NextResponse.json(
    { sets },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
