/**
 * The bracket read's combo facts (Y4a, WAVE4 D5) — how the client asks GET
 * /api/combos/complete and what it answers. Pure and shared by the route
 * and the editor, so the request is built and checked by one rule.
 *
 * One URL per id SET: every distinct card in the list (all zones), sorted
 * and comma-joined, after the game. The complete combos depend on the set
 * alone — zones and copies don't change them, and a combo's identity is its
 * pieces' union, so there is no color filter either (Y3b) — and one
 * canonical form per set keeps the edge cache honest: the route answers 400
 * to any other spelling. No deck id, no token: drafts, private decks and
 * (Y5) share pages ask the same way, and nothing here is a POST.
 */
import type { BracketFreshness, CompleteCombo, GameId } from "@/lib/games/types";

/**
 * The route's cap on distinct ids. A Commander list holds at most 100; 200
 * uuids keep the URL near 7.4 KB, inside every hop's limit.
 */
export const FACTS_MAX_IDS = 200;

/** A card identity id as the database prints it: a lowercase uuid. */
export const FACTS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every distinct card id in the list, sorted — the facts' key and the request's ids. */
export function factsIds(entries: readonly { cardId: string }[]): string[] {
  return [...new Set(entries.map((e) => e.cardId))].sort();
}

/** The canonical request for an id set (sorted, unique — factsIds' output). */
export function factsPath(game: GameId, ids: readonly string[]): string {
  return `/api/combos/complete?game=${game}&ids=${ids.join(",")}`;
}

/**
 * Where a list's facts stand (the editor's useBracketFacts): off = nothing
 * to ask (no read for the game, or no commander yet) · checking · ready ·
 * failed (Retry asks again) · over = more distinct cards than one request
 * carries, so nothing is asked and the read says it couldn't check combos.
 */
export type BracketFactsState = "off" | "checking" | "ready" | "failed" | "over";

export interface BracketFactsBody {
  combos: CompleteCombo[];
  freshness: BracketFreshness;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isCombo = (v: unknown): v is CompleteCombo =>
  isObject(v) &&
  typeof v.key === "string" &&
  Array.isArray(v.cardPieces) &&
  Array.isArray(v.templates) &&
  Array.isArray(v.results);

/** The route's answer, shape-checked; null when it isn't one (the line then says it couldn't check). */
export function parseFacts(json: unknown): BracketFactsBody | null {
  if (!isObject(json) || !Array.isArray(json.combos)) return null;
  const { freshness } = json;
  if (!isObject(freshness) || typeof freshness.readAt !== "string" || !isObject(freshness.feeds)) {
    return null;
  }
  if (!json.combos.every(isCombo)) return null;
  return { combos: json.combos, freshness: freshness as unknown as BracketFreshness };
}
