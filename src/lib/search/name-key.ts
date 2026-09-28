/**
 * The typed name as a query key (X2, WAVE3.md D2) — the half of the ranked
 * name matcher that a client component may import: THE shared normalizer,
 * capped, with the length rules both sides of the suggest endpoint agree on.
 * No database imports here; the ranking itself (tokens, LIKE patterns, the
 * rank expression) lives in `name-match.ts`, which is server-only.
 *
 * The island sends `nameKey(text)` as `q`, so "Sol", "sol" and "sol " are one
 * request and one edge-cache key; the route runs the same function again
 * (idempotent), so a hand-typed URL lands on the same answer.
 */
import { normalizeCardName } from "@/lib/cards/normalize";

/** Fewer normalized characters than this: no request, no popup, an empty answer. */
export const NAME_MIN_CHARS = 2;

/**
 * Normalized characters kept. Longer names are still found by their first
 * 100 characters (as a prefix), and a crafted `?q=` cannot grow the query's
 * pattern list without bound — every word costs a handful of LIKEs.
 */
export const NAME_QUERY_MAX = 100;

/** The normalized, capped query text ("" when nothing survives). */
export function nameKey(raw: string): string {
  return normalizeCardName(raw).slice(0, NAME_QUERY_MAX).trim();
}
