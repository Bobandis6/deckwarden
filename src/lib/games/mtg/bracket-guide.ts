/**
 * The /brackets guide's words (BRACKETS-PAGE, DECKCHECK-STUDY §2.2): adapter
 * data, like the line's (./bracket-line.ts). Wizards' five brackets said for
 * strangers from the same table the read applies (./bracket-ruleset.ts), so
 * a reviewed rules change moves the page with the read; and Wizards' Game
 * Changers as the list the read counts (the flag the nightly writes, the
 * feed that dates it, the revision the pin was reviewed against). The read's
 * own assumption lines and what puts a read past Core belong to
 * ./brackets.ts (they share its sentences and its factor ids), which joins
 * them to these as `mtgBrackets.guide`.
 *
 * Every allowance is one of the table's fields, never Wizards' prose: the
 * page links Wizards' own text for the rest. Plain words (WAVE4 D0, WAVE5
 * D0): number words up to nine as the read's sentences use them ("up to
 * three"), ranges as "to", no dash, at most one middle dot a line
 * (bracket-guide.test.ts guards them).
 */
import type { BracketGuideLevel, BracketGuideMeta } from "../types";
import { MTG_UNFLAGGED } from "./bracket-line";
import {
  BRACKET_RULESET,
  type BracketLevel,
  type ExtraTurnRule,
  type TwoCardComboRule,
} from "./bracket-ruleset";

const LEVELS: readonly BracketLevel[] = BRACKET_RULESET.levels;

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** [1, 2] → "Brackets 1 and 2"; [1, 2, 3] → "Brackets 1 to 3"; [3] → "Bracket 3". */
function bracketsPhrase(levels: readonly number[]): string {
  if (levels.length === 1) return `Bracket ${levels[0]}`;
  if (levels.length === 2) return `Brackets ${levels[0]} and ${levels[1]}`;
  return `Brackets ${levels[0]} to ${levels[levels.length - 1]}`;
}

/** The row labels, in the order every level shows them. */
export const MTG_GUIDE_ROWS = {
  gameChangers: "Game Changers",
  landDenial: "Mass land denial",
  extraTurns: "Extra turns",
  twoCardCombos: "Two-card combos",
  turns: "Games last",
} as const;

const EXTRA_TURNS: Record<ExtraTurnRule, string> = {
  none: "None",
  few: "A few, never chained or looped",
  any: "No limit",
};

function gameChangersValue(n: number | null): string {
  if (n === null) return "No limit";
  return n === 0 ? "None" : `Up to ${numberWord(n)}`;
}

/** "late" is "none early in the game": before the level's own turn line, the read's yardstick for early. */
function twoCardValue(rule: TwoCardComboRule, turns: number | null): string {
  if (rule === "none") return "None";
  if (rule === "any") return "No limit";
  return turns === null ? "None early in the game" : `None before turn ${turns}`;
}

function turnsValue(turns: number | null): string {
  return turns === null ? "Any number of turns" : `At least ${turns} turns`;
}

/** Each level's rows, straight off the reviewed table. */
export function mtgGuideLevels(levels: readonly BracketLevel[] = LEVELS): BracketGuideLevel[] {
  return levels.map((l) => ({
    level: l.level,
    rows: [
      { label: MTG_GUIDE_ROWS.gameChangers, value: gameChangersValue(l.gameChangers) },
      { label: MTG_GUIDE_ROWS.landDenial, value: l.landDenial ? "Allowed" : "None" },
      { label: MTG_GUIDE_ROWS.extraTurns, value: EXTRA_TURNS[l.extraTurns] },
      { label: MTG_GUIDE_ROWS.twoCardCombos, value: twoCardValue(l.twoCardCombos, l.turns) },
      { label: MTG_GUIDE_ROWS.turns, value: turnsValue(l.turns) },
    ],
  }));
}

/**
 * What the levels allow of the Game Changers, one sentence, the levels that
 * allow the same grouped: "Brackets 1 and 2 allow none, Bracket 3 up to
 * three, Brackets 4 and 5 any number."
 */
export function mtgGameChangerAllowance(levels: readonly BracketLevel[] = LEVELS): string {
  const runs: { levels: number[]; allows: number | null }[] = [];
  for (const l of levels) {
    const last = runs[runs.length - 1];
    if (last && last.allows === l.gameChangers) last.levels.push(l.level);
    else runs.push({ levels: [l.level], allows: l.gameChangers });
  }
  const what = (n: number | null) =>
    n === null ? "any number" : n === 0 ? "none" : `up to ${numberWord(n)}`;
  const parts = runs.map((run, i) => {
    const verb = i > 0 ? "" : run.levels.length === 1 ? " allows" : " allow";
    return `${bracketsPhrase(run.levels)}${verb} ${what(run.allows)}`;
  });
  return `${parts.join(", ")}.`;
}

/**
 * Under the levels: a list with none of the cards they name reads the
 * unflagged pair (the line's "Bracket 1 to 2 · nothing here goes past
 * Core"), and only the player can say which of the two it is.
 */
export const MTG_GUIDE_LEVELS_NOTE = `With none of these cards, a list reads Bracket ${MTG_UNFLAGGED.range}: ${MTG_UNFLAGGED.low.name} and ${MTG_UNFLAGGED.top.name} then differ only by intent, which the cards can't show.`;

/** The guide's data half; ./brackets.ts adds `assumptions` and `reasons`. */
export const MTG_BRACKET_GUIDE: Omit<BracketGuideMeta, "assumptions" | "reasons"> = {
  rulesAsOf: BRACKET_RULESET.asOf,
  levels: mtgGuideLevels(),
  levelsNote: MTG_GUIDE_LEVELS_NOTE,
  list: {
    label: "Game Changers",
    // The flag scryfall-map.ts writes (sparse, true only); the read's first flag path.
    path: ["game_changer"],
    feed: "gameChangers",
    asOf: BRACKET_RULESET.gameChangers.asOf,
    count: BRACKET_RULESET.gameChangers.count,
    href: BRACKET_RULESET.sources.gameChangers,
    allowance: mtgGameChangerAllowance(),
  },
};
