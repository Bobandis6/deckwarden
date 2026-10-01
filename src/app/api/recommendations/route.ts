/**
 * POST /api/recommendations (Y2b, WAVE4 D2) — Suggestions for a DRAFT. The
 * editor's Suggestions panel calls it while no deck row exists (a seeded
 * precon, a combo, Surprise me, a chosen leader), so a draft sees the same
 * evidence a saved deck gets from GET /api/decks/[id]/recommendations —
 * and nothing is minted to get it. Once a row exists the panel goes back
 * to the GET; this route never sees a deck id.
 *
 * Body: `{ game, format, leaderIds, entries, budget? }` — ids and
 * quantities only. Every fact (type, cost, color identity) is read
 * server-side through loadEntryFacts, W9a's autofill precedent, so a
 * crafted body can't widen the color filter; an id that isn't a live card
 * of that game answers 400. The snapshot is the one recommendForDeck
 * builds from a stored deck — the leaders (one copy each) plus every other
 * entry with its quantity (the ranker's curve counts copies), the leaders'
 * OR for the color identity — and then the same engine runs:
 * recommendForSnapshot is a new door, not a new engine.
 *
 * Writes nothing. A game without recommendation signals (One Piece)
 * answers 400, like autofill — it's an API, no apology copy. No `owned`
 * filter: the editor learns about a collection from the deck GET, so a
 * draft never offers "Only cards I own".
 *
 * Caching intent: force-dynamic + no-store — the output depends on the
 * body. Rate-limited per IP in its own bucket (RATE_LIMITS
 * .recommendSnapshot) before the body is read, so malformed spam spends
 * quota too.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { findFormat, GAME_ID } from "@/db/seed-data";
import { clientIp } from "@/lib/decks/access";
import { getAdapter } from "@/lib/games/registry";
import { recommendForSnapshot, type RecommendSnapshot } from "@/lib/recommend/engine";
import { loadEntryFacts } from "@/lib/recommend/queries";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** The cards PUT's limits: 500 entries, 1–99 copies; a command zone holds at most two. */
const BODY = z.object({
  game: z.enum(["mtg", "optcg"]),
  format: z.string().max(40),
  leaderIds: z.array(z.uuid()).min(1).max(2),
  entries: z
    .array(z.object({ cardId: z.uuid(), qty: z.number().int().min(1).max(99) }))
    .max(500)
    .default([]),
  /** Budget in USD: only cards with a known price at or under it (the GET's `budget`). */
  budget: z.number().positive().max(100_000).optional(),
});

const bad = (error: string, issues?: unknown) =>
  NextResponse.json(issues ? { error, issues } : { error }, { status: 400, headers: NO_STORE });

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(RATE_LIMITS.recommendSnapshot(clientIp(request.headers)));
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return bad("Body must be JSON");
  }
  const parsed = BODY.safeParse(json);
  if (!parsed.success) return bad("Invalid body", parsed.error.issues);
  const { game, format, leaderIds, entries, budget } = parsed.data;

  if (!getAdapter(game).recommend) return bad(`No recommendations for ${game}`);
  const seededFormat = findFormat(game, format);
  if (!seededFormat) return bad(`Unknown format "${format}" for ${game}`);

  // Server-authoritative facts for every id the client sent.
  const ids = [...new Set([...leaderIds, ...entries.map((e) => e.cardId)])];
  const facts = await loadEntryFacts(GAME_ID[game], ids);
  const unknown = ids.filter((id) => !facts.has(id));
  if (unknown.length > 0) return bad("Unknown card ids for this game", unknown);

  const snapshot: RecommendSnapshot = {
    gameId: GAME_ID[game],
    formatId: seededFormat.id,
    ciMask: leaderIds.reduce((mask, id) => mask | facts.get(id)!.ciMask, 0),
    leaderIds: [...leaderIds],
    entries: [...leaderIds.map((cardId) => ({ cardId, qty: 1 })), ...entries].map((e) => ({
      cardId: e.cardId,
      qty: e.qty,
      primaryType: facts.get(e.cardId)!.primaryType,
      costValue: facts.get(e.cardId)!.costValue,
    })),
  };
  const recommendations = await recommendForSnapshot(snapshot, { maxPriceUsd: budget });

  return NextResponse.json(
    { count: recommendations.length, recommendations },
    { headers: NO_STORE },
  );
}
