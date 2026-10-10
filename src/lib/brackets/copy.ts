/**
 * The bracket line's and the Why sheet's own words (Y4a, WAVE4 D0 and D5) —
 * core's, beside the adapter's (the read's sentences and its line). One
 * table, so D0's copy guard (copy.test.ts) reads every string: none says
 * "approve" (the Warden's word stays legality-only) and none names a
 * Commander Spellbook tag (bracket numbers lead). Game-agnostic: the noun
 * and the level names come off the adapter's `brackets` declaration.
 *
 * Y4b adds the player's side: Your target, the conflict callout, the table
 * exceptions, How it plays, the answers, and "Rules changed since you
 * answered". Y6a adds goals in Suggestions: the goals line ("Your goals:
 * Bracket 2 (Core) · ≤ $5 a card · Change"), the hidden count, the saved
 * budget. Y6b adds the Combo Radar's "above your target".
 */
import type { BracketsMeta } from "@/lib/games/types";

export const BRACKET_COPY = {
  /** D5's loading line: text, no spinner. */
  checking: "Checking combos…",
  /** D5's failure line, before its Retry. */
  failed: "Couldn't check combos",
  retry: "Retry",
  why: "Why?",
  sheetTitle: (noun: string) => `Why this ${noun}?`,
  cardsShow: "What the cards show",
  readAssumes: "What this read assumes",
  draftNote: "The list isn't finished — this is what the cards show so far.",
  nothingFound: (noun: string) => `Nothing in this list raises the ${noun}.`,
  yourCall: "Your call",
  yourCallLead: "The list can't answer these — you and your table can.",
  /** A question's "yes", in the level's own words: "If yes, it's at least Bracket 4 (Optimized)." */
  ifYes: (level: string) => `If yes, it's at least ${level}.`,
  couldntCheck: "Couldn't check",
  howItWorks: "How it works",
  pieces: (n: number) => `${n} ${n === 1 ? "card" : "cards"}`,
  /** "Wizards' Commander Brackets, as of Feb 9, 2026". */
  rules: (label: string, date: string) => `${label}, as of ${date}`,
  /** The Commander Spellbook credit, in the sheet's words. */
  combosCredit: (source: string) => `Combos and their ratings from ${source}`,

  // Y4b (WAVE4 D5) — what the player says, beside what the cards show.
  yourTarget: "Your target",
  notSet: "Not set",
  /** The conflict callout: the findings above the declared target, each with its reason. */
  aboveTarget: "Above your target",
  /** "Your target is Bracket 2 (Core). These put the deck above it:" */
  aboveTargetLead: (level: string) => `Your target is ${level}. These put the deck above it:`,
  exceptions: "Table exceptions",
  /** What visitors will see of the target block (the deck wire's public goals; the share page from Y5). */
  shownOnSharePage: "Shown on your share page.",
  howItPlays: "How it plays",
  howItPlaysLead: "Optional — answer what you know. An answer can only raise the read.",
  /** "2 answered" — beside the collapsed How it plays. */
  answered: (n: number) => `${n} answered`,
  yourAnswer: "Your answer",
  yes: "Yes",
  no: "No",
  unsure: "Not sure",
  answersShown: "Answers that change the read are shown on your share page.",
  /** D5's words: answers given under an older ruleset. */
  rulesChanged: "Rules changed since you answered",
  rulesChangedLead:
    "Your answers still count. Check them against the new rules, or keep them as they are.",
  keepAnswers: "Keep my answers",

  // Y5 (WAVE4 D6) — the share page: "At the table" and what the owner copies.
  atTheTable: "At the table",
  copyForTable: "Copy for the table",
  /** The Copy menu's status once the summary is on the clipboard. */
  copiedForTable: "Copied for the table",
  /** A read-only answer in the visitor's Why sheet. */
  ownersAnswer: "The owner's answer",
  /** An answered question in the copied text: "Owner's call: Do these extra turns chain? No". */
  ownersCall: "Owner's call",
  exceptionsOwner: "Exceptions (owner)",
  /** The owner's description, never generated (D6's plan line). */
  planOwner: "Plan (owner)",
  /** "checked Oct 5, 2026" — when the read's evidence was read. */
  checked: (date: string) => `checked ${date}`,

  // Y6a (WAVE4 D7) — goals in Suggestions and atop the Why sheet.
  /** Before the goals: "Your goals: Bracket 2 (Core) · ≤ $5 a card". */
  goalsLead: "Your goals:",
  /** The goals line's action — the Why sheet at Your target. */
  changeGoals: "Change",
  /** No target and no budget (LATER row 175's door): "No bracket target yet · Set one". */
  noTarget: (noun: string) => `No ${noun} target yet`,
  setTarget: "Set one",
  /** "3 hidden by your goals" — the cards the goals took out of the list. */
  hiddenByGoals: (n: number) => `${n} hidden by your goals`,
  showHidden: "Show",
  hideHidden: "Hide",
  saveBudget: "Save as this deck's budget",
  /** The one-away combo scan stopped at its cap, so the goals didn't see every combo. */
  combosCapped:
    "Combo checks stopped at the most popular combos near this deck — rarer ones weren't checked against your goals.",

  // Y6b (WAVE4 D7) — the Combo Radar's badges, beside the adapter's words.
  /** After a combo's badge when either of its levels is above the deck's target. */
  aboveTargetInline: "above your target",
} as const;

/**
 * The goals line's parts (Y6a): the target in the level's own words, then
 * the per-card budget's label — "Bracket 2 (Core)", "≤ $5 a card". Empty
 * when neither is set.
 */
export function goalsParts(
  brackets: Pick<BracketsMeta, "noun" | "levels"> | undefined,
  goals: { targetLevel?: number; budget?: { perCardUsd?: number } } | null,
  budgetLabel: (perCardUsd: number) => string,
): string[] {
  const parts: string[] = [];
  if (brackets && goals?.targetLevel !== undefined) {
    parts.push(levelLabel(brackets, goals.targetLevel));
  }
  if (goals?.budget?.perCardUsd !== undefined) parts.push(budgetLabel(goals.budget.perCardUsd));
  return parts;
}

/**
 * "Bracket 3 (declared)" — the owner's target on tiles and unfurls (Y5,
 * D6): declared, never computed, and said so.
 */
export function declaredLabel(brackets: Pick<BracketsMeta, "noun">, level: number): string {
  const noun = brackets.noun.charAt(0).toUpperCase() + brackets.noun.slice(1);
  return `${noun} ${level} (declared)`;
}

/** "Bracket 3 (Upgraded)" — the adapter's noun, capitalized, and the level's name. */
export function levelLabel(brackets: Pick<BracketsMeta, "noun" | "levels">, level: number): string {
  const noun = brackets.noun.charAt(0).toUpperCase() + brackets.noun.slice(1);
  const name = brackets.levels.find((l) => l.level === level)?.name;
  return name ? `${noun} ${level} (${name})` : `${noun} ${level}`;
}

/**
 * "Feb 9, 2026" — pinned to UTC, like every date a client component
 * renders (server and client must agree). `timeZone` is for text built
 * only in the browser, on a click (Y5's Copy for the table: pasted at 9 PM
 * in Chicago, a UTC date reads as tomorrow's).
 */
export function dateLabel(iso: string, timeZone = "UTC"): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}
