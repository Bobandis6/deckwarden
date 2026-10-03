/**
 * Magic's bracket ruleset (WAVE4 D4) — adapter data only, versioned.
 *
 * Wizards' Commander Brackets as the read applies them: the five brackets,
 * what each allows, and how many turns Wizards expects a game to last. The
 * read (./brackets.ts) derives every allowance it quotes from this table, so
 * a rules change is a reviewed edit here, not in the engine.
 *
 * Read on 2026-10-02 against Wizards' pages (WAVE4 B):
 * - the format page's five bracket entries (magic.wizards.com/en/formats/commander#brackets),
 *   last edited 2025-11-05: the Oct 21 2025 update's turn expectations, tutor
 *   limits gone, precons no longer tied to Core;
 * - the deck-building barometers from the Feb 11 2025 introduction, unchanged
 *   since (the Apr 22 2025 update restated them): no Game Changers in
 *   Brackets 1–2 and up to three in 3; no mass land denial through 3; no
 *   extra-turn cards in 1, and in 2–3 only a few, never chained or looped; no
 *   intentional two-card infinite combos in 1–2, and none early in 3;
 * - the Game Changers list (53 cards), last changed 2026-02-09 (Farewell and
 *   Biorhythm added).
 *
 * `version` counts reviewed changes to what the read applies — the brackets,
 * their allowances, the turns. Answers record it (Y4b) and a bump flags them.
 * A Game Changers pin move alone doesn't bump it: the flags update themselves
 * nightly and no answer depends on the list. Y3a's version 1 was the pin
 * alone, which nothing ever answered against, so the first ruleset the read
 * applies stays 1.
 *
 * The pin: the nightly's ruleset watch (scripts/ruleset-watch.ts) fails when
 * Scryfall's Game Changers stop matching it. Moving it is a reviewed change:
 * read Wizards' announcement, then update asOf, count and md5 together (the
 * watch prints Scryfall's count and md5). Keep `gameChangers`' path and shape
 * — the watch reads exactly that.
 */

/** none = not one card · few = a few, never chained or looped · any = no limit. */
export type ExtraTurnRule = "none" | "few" | "any";
/** none = no intentional two-card infinite combos · late = none early in the game · any = no limit. */
export type TwoCardComboRule = "none" | "late" | "any";

export interface BracketLevel {
  level: number;
  name: string;
  /** How many Game Changers it allows; null = no limit. */
  gameChangers: number | null;
  /** Whether it allows mass land denial. */
  landDenial: boolean;
  extraTurns: ExtraTurnRule;
  twoCardCombos: TwoCardComboRule;
  /** The turns Wizards expects a game to last before anyone wins or loses; null = any turn. */
  turns: number | null;
}

export const BRACKET_RULESET = {
  version: 1,
  /** The bracket text as reviewed: the format page's five entries, last edited 2025-11-05. */
  asOf: "2025-11-05",
  levels: [
    {
      level: 1,
      name: "Exhibition",
      gameChangers: 0,
      landDenial: false,
      extraTurns: "none",
      twoCardCombos: "none",
      turns: 9,
    },
    {
      level: 2,
      name: "Core",
      gameChangers: 0,
      landDenial: false,
      extraTurns: "few",
      twoCardCombos: "none",
      turns: 8,
    },
    {
      level: 3,
      name: "Upgraded",
      gameChangers: 3,
      landDenial: false,
      extraTurns: "few",
      twoCardCombos: "late",
      turns: 6,
    },
    {
      level: 4,
      name: "Optimized",
      gameChangers: null,
      landDenial: true,
      extraTurns: "any",
      twoCardCombos: "any",
      turns: 4,
    },
    {
      level: 5,
      name: "cEDH",
      gameChangers: null,
      landDenial: true,
      extraTurns: "any",
      twoCardCombos: "any",
      turns: null,
    },
  ] as const satisfies readonly BracketLevel[],
  gameChangers: {
    /** The revision of Wizards' Game Changers list this pin was reviewed against (Farewell and Biorhythm added). */
    asOf: "2026-02-09",
    count: 53,
    /** gameChangerDigest() over the oracle ids Scryfall flags `game_changer` — measured 2026-10-01. */
    md5: "38ff92800a67529ee6b9fa81f4203033",
  },
  /** Where the sheet links (Y4a). */
  sources: {
    brackets: "https://magic.wizards.com/en/formats/commander#brackets",
    gameChangers: "https://magic.wizards.com/en/formats/commander#gamechangers",
  },
} as const;
