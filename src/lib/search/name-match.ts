/**
 * The ranked name matcher (X2, WAVE3.md D2) — the ONLY place the ranking
 * contract lives. Three callers read it: the suggest endpoint (the dropdown
 * over /commanders, /leaders and /cards), the hub filters (`?q=` on
 * /commanders and /leaders, REC-3) and the /cards grid (`sort=best`, REC-2).
 *
 * The contract, over `name_norm` (THE shared normalizer's output — commas,
 * straight apostrophes and hyphens are KEPT, so the patterns below work on
 * what ingest stored and nothing here re-normalizes a name):
 *
 *   1  the name IS the typed text
 *   2  the name STARTS WITH the typed text
 *   3  every typed word starts a word in the name
 *   4  every typed word appears somewhere in the name, inside a word included
 *   5  near misses — `name_norm % text` (pg_trgm, similarity ≥ 0.3), ordered
 *      by similarity; what finds Urza's Saga from "urzas saga"
 *
 * The one switch (`nameMatchCondition`): the dropdown accepts classes 1–3
 * ("atr" must not offer Rakdos, Patron of Chaos) and runs class 5 as a
 * separate statement only when it found fewer than SUGGEST_LIMIT rows and at
 * least NEAR_MISS_MIN_CHARS were typed; a list (the hub filter) accepts
 * classes 1–4 plus class 5 from NEAR_MISS_MIN_CHARS on, ranked last, so a
 * list is always a superset of the dropdown above it. The /cards grid keeps
 * the translator's own WHERE (its default path must not move by a byte) and
 * borrows only the order.
 *
 * A word starts at the start of the name or after a space, a hyphen, a
 * period, a double quote or an opening parenthesis. The contract named the
 * first two ("jiki" finds Kiki-Jiki); the other three were measured on the
 * live corpus on 2026-09-27: 273 One Piece names join words with a period
 * (Monkey.D.Luffy, Edward.Newgate, Marshall.D.Teach — leaders all), 46 with a
 * quote (Eustass"Captain"Kid) and 45 open a parenthesis without a space
 * (Miss Doublefinger(Zala)). Under the narrower rule "luffy" would be class 4
 * and every Luffy would vanish from the /leaders dropdown. The apostrophe is
 * NOT a break: the "s" of "Urza's" starts no word.
 *
 * Inside a class: most played first (EDHREC rank, unranked last), then
 * leaders first, then the name, then the card number. One order for both
 * games: One Piece has no rank, so it reads "leaders, name, card number" as
 * the contract asks; Magic's ranked rows read "by play, then name", and only
 * among Magic's unranked rows of one class does "leaders first" decide.
 *
 * Every typed value is a bound parameter. LIKE patterns escape `\`, `%` and
 * `_` with a backslash (Postgres's default LIKE escape — no ESCAPE clause),
 * so typing "_" finds the card named "_____" and not every card.
 */
import { sql, type SQL } from "drizzle-orm";

import { cardIdentities } from "@/db/schema";
import type { SearchFieldDef } from "@/lib/games/types";
import { nameKey } from "@/lib/search/name-key";

const ci = cardIdentities;

/** Rows the dropdown shows (D0: at most 8). */
export const SUGGEST_LIMIT = 8;

/** Class 5 needs at least this many normalized characters. */
export const NEAR_MISS_MIN_CHARS = 4;

/** What a word may start after, besides the start of the name (module docblock). */
export const WORD_BREAKS = [" ", "-", ".", '"', "("] as const;

export interface NameQuery {
  /** The normalized, capped text (`nameKey`). */
  text: string;
  /**
   * Its words, split on spaces. Words with no letter or digit are dropped
   * ("kiki - jiki" is two words) unless nothing else is left ("_____").
   */
  words: string[];
}

/** The typed name as a query, or null when nothing survives normalization. */
export function parseNameQuery(raw: string | null | undefined): NameQuery | null {
  const text = nameKey(raw ?? "");
  if (!text) return null;
  const all = text.split(" ");
  const meaningful = all.filter((word) => /[\p{L}\p{N}]/u.test(word));
  return { text, words: meaningful.length > 0 ? meaningful : all };
}

/** Escape LIKE's wildcards and its escape character (backslash, the default escape). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * The contract as LIKE patterns — the one definition both the SQL below and
 * the unit tests read. `exact` is compared with `=`; every other string is a
 * LIKE pattern, already escaped.
 */
export interface MatchPatterns {
  /** Class 1. */
  exact: string;
  /** Class 2. */
  prefix: string;
  /** Class 3: EVERY word matches ONE of its patterns. */
  wordStarts: string[][];
  /** Class 4: EVERY word matches its pattern. */
  contains: string[];
}

export function matchPatterns(q: NameQuery): MatchPatterns {
  return {
    exact: q.text,
    prefix: `${escapeLike(q.text)}%`,
    wordStarts: q.words.map((word) => {
      const e = escapeLike(word);
      return [`${e}%`, ...WORD_BREAKS.map((b) => `%${b}${e}%`)];
    }),
    contains: q.words.map((word) => `%${escapeLike(word)}%`),
  };
}

function anyLike(patterns: readonly string[]): SQL {
  const arms = patterns.map((p) => sql`${ci.nameNorm} LIKE ${p}`);
  return arms.length === 1 ? arms[0] : sql`(${sql.join(arms, sql` OR `)})`;
}

function allOf(parts: SQL[]): SQL {
  return parts.length === 1 ? parts[0] : sql`(${sql.join(parts, sql` AND `)})`;
}

/** Classes 1–3. A name that starts with the text starts a word with each of its words. */
function wordStartsCondition(p: MatchPatterns): SQL {
  return allOf(p.wordStarts.map(anyLike));
}

/** Classes 1–4: every word somewhere. The pattern the trigram index serves best. */
function containsCondition(p: MatchPatterns): SQL {
  return allOf(p.contains.map((c) => anyLike([c])));
}

/** Class 5's test: pg_trgm similarity at the server's threshold (0.3, measured 2026-09-27). */
export function nameNearMissCondition(q: NameQuery): SQL {
  return sql`${ci.nameNorm} % ${q.text}`;
}

/**
 * The WHERE arm — the module's one switch. "suggest": classes 1–3 (the
 * dropdown's first statement). "list": classes 1–4, plus class 5 once the
 * text reaches NEAR_MISS_MIN_CHARS.
 */
export function nameMatchCondition(q: NameQuery, accept: "suggest" | "list"): SQL {
  const p = matchPatterns(q);
  if (accept === "suggest") return wordStartsCondition(p);
  const within = containsCondition(p);
  return q.text.length >= NEAR_MISS_MIN_CHARS
    ? sql`(${within} OR ${nameNearMissCondition(q)})`
    : within;
}

/**
 * The rank: 1–4 for the four classes, and `6 - similarity` for anything
 * else — (5, 6] — so near misses sort after class 4 and by similarity among
 * themselves, in one ORDER BY key. `similarity()` runs only for rows that
 * fell through every LIKE (CASE short-circuits).
 */
export function nameMatchRank(q: NameQuery): SQL {
  const p = matchPatterns(q);
  return sql`CASE WHEN ${ci.nameNorm} = ${p.exact} THEN 1 WHEN ${ci.nameNorm} LIKE ${p.prefix} THEN 2 WHEN ${wordStartsCondition(p)} THEN 3 WHEN ${containsCondition(p)} THEN 4 ELSE 6 - similarity(${ci.nameNorm}, ${q.text}) END`;
}

/** The whole ORDER BY: the rank, then the within-class order (module docblock). */
export function nameMatchOrder(q: NameQuery): SQL[] {
  return [
    sql`${nameMatchRank(q)} ASC`,
    sql`${ci.popularity} ASC NULLS LAST`,
    sql`${ci.isLeaderCandidate} DESC`,
    sql`${ci.nameNorm} ASC`,
    sql`${ci.externalKey} ASC`,
  ];
}

/**
 * The adapter's name field — the text field matched by trigram over
 * `name_norm` — whose value `sort=best` ranks by. Found by declaration, not
 * by key, so the search route stays game-agnostic.
 */
export function nameFieldKey(fields: readonly SearchFieldDef[]): string | null {
  const field = fields.find(
    (f) =>
      f.kind === "text" &&
      f.match === "trgm" &&
      "column" in f.target &&
      f.target.column === "name_norm",
  );
  return field?.key ?? null;
}
