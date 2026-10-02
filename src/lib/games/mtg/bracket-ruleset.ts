/**
 * Magic's bracket ruleset (WAVE4 D4) — adapter data only, versioned.
 *
 * Y3a pins the Game Changers this ruleset was reviewed against; the nightly's
 * ruleset watch (scripts/ruleset-watch.ts) fails when Scryfall's set stops
 * matching the pin. The flags in card_identities.attrs update themselves —
 * the watch exists so a rules change is read by a person. Moving the pin is a
 * reviewed change: read Wizards' announcement, then update asOf, count and md5
 * together (the watch prints Scryfall's count and md5).
 *
 * Y3b grows this module: the five brackets and their names, the allowances,
 * the land-denial / extra-turn / two-card-combo rules, the turn expectations,
 * the source links and the bracket text's own as-of date.
 */
export const BRACKET_RULESET = {
  version: 1,
  gameChangers: {
    /** The revision of Wizards' Game Changers list this pin was reviewed against (Farewell and Biorhythm added). */
    asOf: "2026-02-09",
    count: 53,
    /** gameChangerDigest() over the oracle ids Scryfall flags `game_changer` — measured 2026-10-01. */
    md5: "38ff92800a67529ee6b9fa81f4203033",
  },
} as const;
