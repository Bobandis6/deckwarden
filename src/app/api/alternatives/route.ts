/**
 * POST /api/alternatives (Y7a, WAVE4 D8) — Swap Lab: cards that share a job
 * with one card in the list, inside the deck's goals. A snapshot like the
 * draft Suggestions POST, so drafts and saved decks ask the same way: the
 * Card tab sends the list it holds, the card to swap and the deck's goals,
 * and nothing is minted to answer.
 *
 * Body: `{ game, format, leaderIds, entries, cardId, goals? }` — ids and
 * copies only (D8 named the list `entryIds`; both precedents call it
 * `entries`). Every fact — type, cost, identity, the bracket flags and the
 * card's roles — is read server-side through loadEntryFacts, so a crafted
 * body can't widen the filter; an id that isn't a live card of that game
 * answers 400, and so does a `cardId` that isn't in `entries` (leaders are
 * never swapped here). `goals` is checked against the game like a stored
 * deck's.
 *
 * Answers `{ cardId, roles, alternatives, hidden, combosTruncated,
 * tradeoff, reason? }`: each row is a goaled recommendation with the roles
 * it shares and its CardWire (legality included — the editor adds it as
 * is). An honest empty list is never an error: `reason` says why —
 * "no-roles" (the card holds none yet: until the first nightly with roles,
 * that is every card), "not-offered" (the adapter offers none for this kind
 * of card — Magic's lands), "goals" (every match is hidden by the goals) or
 * "none" (nothing shares a role inside the deck's colors and the cost
 * window). A game without a swap declaration (One Piece) answers 400 — an
 * API, no apology copy.
 *
 * Caching intent: force-dynamic + no-store — the output depends on the body.
 * Rate-limited per IP in its own bucket (RATE_LIMITS.alternatives) before
 * the body is read, so malformed spam spends quota too.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { findFormat, GAME_ID } from "@/db/seed-data";
import { loadCardWires } from "@/lib/cards/wire";
import { clientIp } from "@/lib/decks/access";
import { goalsSchema } from "@/lib/decks/goals";
import { getAdapter } from "@/lib/games/registry";
import { alternativesForSnapshot, type Alternative } from "@/lib/recommend/alternatives";
import type { RecommendSnapshot } from "@/lib/recommend/engine";
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
  /** The card to swap out — one of `entries`. */
  cardId: z.uuid(),
  /** The deck's goals — shape-checked against the game below. */
  goals: z.unknown().optional(),
});

const bad = (error: string, issues?: unknown) =>
  NextResponse.json(issues ? { error, issues } : { error }, { status: 400, headers: NO_STORE });

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(RATE_LIMITS.alternatives(clientIp(request.headers)));
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return bad("Body must be JSON");
  }
  const parsed = BODY.safeParse(json);
  if (!parsed.success) return bad("Invalid body", parsed.error.issues);
  const { game, format, leaderIds, entries, cardId } = parsed.data;

  const adapter = getAdapter(game);
  const swap = adapter.recommend?.swap;
  if (!swap) return bad(`No alternatives for ${game}`);
  const seededFormat = findFormat(game, format);
  if (!seededFormat) return bad(`Unknown format "${format}" for ${game}`);
  const goals =
    parsed.data.goals === undefined || parsed.data.goals === null
      ? null
      : goalsSchema(adapter.brackets).safeParse(parsed.data.goals);
  if (goals && !goals.success) return bad("Invalid goals", goals.error.issues);
  if (!entries.some((e) => e.cardId === cardId)) {
    return bad("The card to swap must be in the list's entries (leaders aren't swapped here)");
  }

  // Server-authoritative facts for every id the client sent, the roles riding along.
  const ids = [...new Set([...leaderIds, ...entries.map((e) => e.cardId)])];
  const facts = await loadEntryFacts(
    GAME_ID[game],
    ids,
    adapter.brackets?.flagPaths,
    swap.rolesPath,
  );
  const unknown = ids.filter((id) => !facts.has(id));
  if (unknown.length > 0) return bad("Unknown card ids for this game", unknown);

  const card = facts.get(cardId)!;
  // Declared roles only, the adapter's order — a retired key in attrs is no role.
  const owned = new Set(card.roles ?? []);
  const roles = swap.roles.map((r) => r.key).filter((k) => owned.has(k));
  const answer = (
    rest: {
      alternatives: Alternative[];
      hidden: Alternative[];
      combosTruncated: boolean;
      tradeoff: unknown;
    },
    reason?: "no-roles" | "not-offered" | "goals" | "none",
  ) =>
    NextResponse.json(
      { cardId, roles, ...rest, ...(reason ? { reason } : {}) },
      { headers: NO_STORE },
    );
  const empty = { alternatives: [], hidden: [], combosTruncated: false, tradeoff: null };
  if (!swap.offers(card)) return answer(empty, "not-offered");
  if (roles.length === 0) return answer(empty, "no-roles");

  const snapshot: RecommendSnapshot = {
    gameId: GAME_ID[game],
    formatId: seededFormat.id,
    ciMask: leaderIds.reduce((mask, id) => mask | facts.get(id)!.ciMask, 0),
    leaderIds: [...leaderIds],
    entries: [...leaderIds.map((id) => ({ cardId: id, qty: 1 })), ...entries].map((e) => {
      // The roles ride along unread: the bracket read takes only `flags`.
      const { primaryType, costValue, ...readFacts } = facts.get(e.cardId)!;
      return { cardId: e.cardId, qty: e.qty, primaryType, costValue, facts: readFacts };
    }),
  };
  const result = await alternativesForSnapshot({
    snapshot,
    cardId,
    roles,
    costValue: card.costValue,
    goals: goals?.data ?? null,
  });

  // The editor adds a pick as is: every row carries its CardWire, legality included.
  const wires = new Map(
    (
      await loadCardWires(
        [...result.alternatives, ...result.hidden].map((r) => r.cardId),
        seededFormat.id,
      )
    ).map((w) => [w.id, w]),
  );
  const withCard = (rows: Alternative[]) =>
    rows.flatMap((r) => (wires.has(r.cardId) ? [{ ...r, card: wires.get(r.cardId)! }] : []));
  const alternatives = withCard(result.alternatives);
  const hidden = withCard(result.hidden);
  return answer(
    {
      alternatives,
      hidden,
      combosTruncated: result.combosTruncated,
      tradeoff: result.tradeoff,
    },
    alternatives.length > 0 ? undefined : hidden.length > 0 ? "goals" : "none",
  );
}
