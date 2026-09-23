/**
 * GET /api/leaders/random?game= — the "Surprise me" roll (W9c): one random
 * LEGAL leader, returned as a full CardWire so the draft seeder can put it
 * straight into the leader zone without spending a resolve unit (a surprise
 * draft stays at zero POSTs until a real edit). Sampling lives in
 * loadRandomLeaderId (Magic: uniform inside the most-played pool; One
 * Piece: uniform over all legal leaders) with the staples' banned/not-legal
 * NOT EXISTS — loadLeaderIndex deliberately keeps banned commanders for
 * reference, this route must never deal one.
 *
 * Caching intent: force-dynamic + no-store — every hit is a fresh roll,
 * which is the whole point. That also makes it uncacheable at the edge, so
 * it gets its own rate bucket (leadersRandom, 30/min per IP).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { findFormat } from "@/db/seed-data";
import { loadCardWires } from "@/lib/cards/wire";
import { clientIp } from "@/lib/decks/access";
import { getAdapter } from "@/lib/games/registry";
import { loadRandomLeaderId } from "@/lib/hub/queries";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const QUERY = z.object({ game: z.enum(["mtg", "optcg"]) });

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(RATE_LIMITS.leadersRandom(clientIp(request.headers)));
  if (limited) return limited;

  const query = QUERY.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: query.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const { game } = query.data;

  // The game's first (currently only) format — same default the /decks/new
  // chooser drafts with, so the wire's legality matches the editor's.
  const adapter = getAdapter(game);
  const seededFormat = findFormat(game, adapter.formats[0].code);
  if (!seededFormat) {
    return NextResponse.json(
      { error: `No format seeded for ${game}` },
      { status: 500, headers: NO_STORE },
    );
  }

  const id = await loadRandomLeaderId(game, seededFormat.id);
  if (!id) {
    return NextResponse.json(
      { error: `No legal leaders to sample for ${game}` },
      { status: 404, headers: NO_STORE },
    );
  }
  const [leader] = await loadCardWires([id], seededFormat.id);
  return NextResponse.json({ leader: leader ?? null }, { headers: NO_STORE });
}
