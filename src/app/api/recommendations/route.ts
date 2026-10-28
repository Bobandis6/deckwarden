/**
 * POST /api/recommendations (Y2b, WAVE4 D2) — Suggestions for a DRAFT. The
 * editor's Suggestions panel calls it while no deck row exists (a seeded
 * precon, a combo, Surprise me, a chosen leader), so a draft sees the same
 * evidence a saved deck gets from GET /api/decks/[id]/recommendations —
 * and nothing is minted to get it. Once a row exists the panel goes back
 * to the GET; this route never sees a deck id.
 *
 * BRACKET-UP's "Upgrade toward" sheet asks it too, for a saved deck as for
 * a draft: the editor's live list and goals in the same body (the GET would
 * read a target the autosave may not have written yet). Same contract, no
 * deck id, the same bucket, plus `powerFirst`: with a target above what the
 * list shows, the cards the game counts toward it lead the answer
 * (engine.ts' RecommendOptions).
 *
 * Body: `{ game, format, leaderIds, entries, budget?, goals? }` — ids and
 * quantities only. Every fact (type, cost, color identity, the bracket
 * flags) is read server-side through loadEntryFacts, W9a's autofill
 * precedent, so a crafted body can't widen the color filter; an id that
 * isn't a live card of that game answers 400. `goals` (Y6a) is the draft's
 * own — target, budget, answers — checked against the game like a stored
 * deck's (goals.ts' goalsSchema), and applied the GET's way: the answer
 * carries `hidden` and `combosTruncated` too. The snapshot is the one recommendForDeck
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
import { badRequest, noStoreJson, parseJsonBody } from "@/lib/api/json";
import { clientIp } from "@/lib/decks/access";
import { goalsSchema } from "@/lib/decks/goals";
import { getAdapter } from "@/lib/games/registry";
import { recommendForSnapshot, type RecommendSnapshot } from "@/lib/recommend/engine";
import { loadEntryFacts } from "@/lib/recommend/queries";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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
  /** The draft's goals (Y6a) — shape-checked against the game below. */
  goals: z.unknown().optional(),
  /** BRACKET-UP's power first: the cards that count toward the target lead. */
  powerFirst: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(RATE_LIMITS.recommendSnapshot(clientIp(request.headers)));
  if (limited) return limited;

  const body = await parseJsonBody(request, BODY);
  if (body instanceof NextResponse) return body;
  const { game, format, leaderIds, entries, budget } = body;

  const adapter = getAdapter(game);
  if (!adapter.recommend) return badRequest(`No recommendations for ${game}`);
  const seededFormat = findFormat(game, format);
  if (!seededFormat) return badRequest(`Unknown format "${format}" for ${game}`);
  const goals =
    body.goals === undefined || body.goals === null
      ? null
      : goalsSchema(adapter.brackets).safeParse(body.goals);
  if (goals && !goals.success) return badRequest("Invalid goals", goals.error.issues);

  // Server-authoritative facts for every id the client sent.
  const ids = [...new Set([...leaderIds, ...entries.map((e) => e.cardId)])];
  const facts = await loadEntryFacts(GAME_ID[game], ids, adapter.brackets?.flagPaths);
  const unknown = ids.filter((id) => !facts.has(id));
  if (unknown.length > 0) return badRequest("Unknown card ids for this game", unknown);

  const snapshot: RecommendSnapshot = {
    gameId: GAME_ID[game],
    formatId: seededFormat.id,
    ciMask: leaderIds.reduce((mask, id) => mask | facts.get(id)!.ciMask, 0),
    leaderIds: [...leaderIds],
    entries: [...leaderIds.map((cardId) => ({ cardId, qty: 1 })), ...entries].map((e) => {
      const { primaryType, costValue, ...readFacts } = facts.get(e.cardId)!;
      return { cardId: e.cardId, qty: e.qty, primaryType, costValue, facts: readFacts };
    }),
  };
  const { recommendations, hidden, combosTruncated } = await recommendForSnapshot(snapshot, {
    maxPriceUsd: budget,
    goals: goals?.data ?? null,
    powerFirst: body.powerFirst,
  });

  return noStoreJson({ count: recommendations.length, recommendations, hidden, combosTruncated });
}
