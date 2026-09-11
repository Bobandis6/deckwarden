/**
 * Id-shaped decklist tokens for POST /api/cards/resolve's pass 0 (P4.1 →
 * P4.6 → R5b). Pure: the route classifies every pasted token here and
 * looks the keys up on `card_identities.external_key` in one query.
 *
 * One Piece: identity IS the card id ("OP01-025" — 1,615 duplicate names
 * upstream), so a bare id or a Limitless-export trailing "(OP12-071)" names
 * the key, uppercased (P4.6).
 *
 * Magic (R5b, the /c/ "Build with this commander" CTA — LATER's CTA row):
 * the external key is the Scryfall ORACLE id, a uuid. A uuid can never be
 * a card name, so a uuid-shaped token has no false positives; it is
 * lowercased because Scryfall's ids are. Nothing else about Magic
 * resolution changes — names still go through the name_norm passes.
 *
 * A BARE id (the whole token is an id) that matches nothing is a miss with
 * NO fuzzy suggestions: an id is not a misspelled name, and trgm
 * similarity against "c983338d ae6b …" would only ever surface junk. A
 * name carrying a trailing id keeps its name for the fuzzy pass.
 */
export type ResolveGame = "mtg" | "optcg";

const OPTCG_ID = /^[A-Z]+\d*-\d+$/;
const OPTCG_TRAILING_ID = /\(([A-Za-z]+\d*-\d+)\)\s*$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The external key a token names (normalized to the stored case), or null for a plain name. */
export function classifyResolveToken(game: ResolveGame, input: string): string | null {
  const bare = input.trim();
  if (game === "optcg") {
    const upper = bare.toUpperCase();
    if (OPTCG_ID.test(upper)) return upper;
    const trailing = OPTCG_TRAILING_ID.exec(bare);
    return trailing ? trailing[1].toUpperCase() : null;
  }
  return UUID_RE.test(bare) ? bare.toLowerCase() : null;
}

/** True when the WHOLE token is an id — never fuzzy-matched against names. */
export function isBareIdToken(game: ResolveGame, input: string): boolean {
  const bare = input.trim();
  return game === "optcg" ? OPTCG_ID.test(bare.toUpperCase()) : UUID_RE.test(bare);
}
