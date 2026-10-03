/**
 * Commander Spellbook's bracket tag letters (Y3a) — client-safe on purpose:
 * the bracket read (./brackets.ts) runs in the browser, and ./spellbook-map.ts
 * reaches node:crypto through ./scryfall-map.ts. spellbook-map re-exports
 * these, so the ingest's imports are unchanged.
 */

/**
 * The tag letters WAVE4 D4's ladder reads (R → at least 4 … E → nothing). B,
 * Spellbook's mark for a combo Commander bans, only rides on variants the
 * legality filter drops first; any other letter is stored as NULL and counted.
 */
export const SPELLBOOK_BRACKET_TAGS = ["R", "S", "P", "O", "C", "E"] as const;
export type SpellbookBracketTag = (typeof SPELLBOOK_BRACKET_TAGS)[number];

export function bracketTagOf(raw: unknown): SpellbookBracketTag | null {
  return (SPELLBOOK_BRACKET_TAGS as readonly unknown[]).includes(raw)
    ? (raw as SpellbookBracketTag)
    : null;
}
