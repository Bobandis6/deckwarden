/**
 * The token catalog's one core convention (DECK-TOKENS). Ingest marks token
 * objects — Magic's tokens, emblems and game pieces such as The Monarch —
 * with a sparse `attrs.is_token: true` (the game_changer pattern: no column,
 * so no migration, and a game whose ingest never writes it has no tokens).
 * They belong in a deck's token zone (`ZoneDef.holds: "tokens"`) and nowhere
 * else, so:
 *   - every query that picks DECK cards by anything but a known id ANDs in
 *     `notTokenSql` (./tokens-sql.ts) — search, suggest, name resolution,
 *     collections, sets, sitemaps, keyword options, candidate pools, the
 *     Topdeck name maps — because 90 token names are also card names
 *     (Mutavault, Storm Crow) and 105 name several different tokens
 *     (fifteen Soldiers);
 *   - the Tokens section asks for `tokenSql` instead.
 * Pure and client-safe; the SQL lives beside it.
 */

/**
 * The flag's containment document, bound by the drizzle guards
 * (./tokens-sql.ts). Raw postgres.js queries write it as a SQL literal
 * instead: postgres.js JSON-encodes a string sent to a jsonb parameter.
 */
export const TOKEN_DOC = JSON.stringify({ is_token: true });

/** The same test on a card already in hand (CardData / CardWire attrs). */
export function isTokenCard(card: { attrs: Record<string, unknown> }): boolean {
  return card.attrs.is_token === true;
}
