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
 * Bracket 2 (Core), ≤ $5 a card" and Change), the hidden count, the saved
 * budget. Y6b adds the Combo Radar's "above your target". BRACKET-SPEED
 * adds the speed block's heading and its sentence; the facts themselves
 * are the adapter's words (they name card kinds). DECK-PREVIEW-BRACKET adds
 * the Share dialog's line: what link previews say about the bracket. LATER
 * row 306 makes Your target's note say where else the target shows.
 * TARGET-CHANGES adds the callout a pick of Your target pops in: what the
 * pick did, first that the cards didn't change; the rows it quotes are the
 * adapter's guide rows, and the tools it names are core's own.
 */
import type { BracketsMeta } from "@/lib/games/types";

/** The conflict callout's heading, which the target-change callout points at. */
const ABOVE_TARGET = "Above your target";

/**
 * "1 thing", "3 things": the read's conflicts, counted in the words the
 * conflict callout uses for them ("These put the deck above it").
 */
const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;

/** "Suggestions", "Suggestions and Autofill", "Suggestions, Autofill and Swap Lab". */
function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Clauses joined by ", and ", capitalized, with a period; "" with none. */
function sentence(clauses: readonly (string | null)[]): string {
  const said = clauses.filter((c): c is string => c !== null);
  if (said.length === 0) return "";
  const text = said.join(", and ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

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
  draftNote: "The list isn't finished. This is what the cards show so far.",
  nothingFound: (noun: string) => `Nothing in this list raises the ${noun}.`,
  yourCall: "Your call",
  yourCallLead: "The list can't answer these. You and your table can.",
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
  aboveTarget: ABOVE_TARGET,
  /** "Your target is Bracket 2 (Core). These put the deck above it:" */
  aboveTargetLead: (level: string) => `Your target is ${level}. These put the deck above it:`,
  exceptions: "Table exceptions",
  /**
   * Where the target block shows (LATER row 306): all of it on the share page
   * (the deck wire's public goals, Y5), and the target alone on the deck's
   * tile wherever it is listed and in its link previews ("Bracket 3
   * (declared)", Y5). A private deck's preview is the generic image, so
   * `previews` is false there and the note leaves them out.
   */
  targetShown: (previews: boolean) =>
    previews
      ? "Shown on your share page. Your target also shows in link previews and where the deck is listed."
      : "Shown on your share page. Your target also shows where the deck is listed.",
  howItPlays: "How it plays",
  howItPlaysLead: "Optional: answer what you know. An answer can only raise the read.",
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
  /** Before the goals: "Your goals: Bracket 2 (Core), ≤ $5 a card". */
  goalsLead: "Your goals:",
  /** The goals line's action — the Why sheet at Your target (the Share dialog's too, with a target). */
  changeGoals: "Change",
  /** No target and no budget (LATER row 175's door): "No bracket target yet" and "Set one". */
  noTarget: (noun: string) => `No ${noun} target yet`,
  setTarget: "Set one",
  /** "3 hidden by your goals" — the cards the goals took out of the list. */
  hiddenByGoals: (n: number) => `${n} hidden by your goals`,
  showHidden: "Show",
  hideHidden: "Hide",
  saveBudget: "Save as this deck's budget",
  /** The one-away combo scan stopped at its cap, so the goals didn't see every combo. */
  combosCapped:
    "Combo checks stopped at the most popular combos near this deck. Rarer ones weren't checked against your goals.",

  // Y6b (WAVE4 D7) — the Combo Radar's badges, beside the adapter's words.
  /** After a combo's badge when either of its levels is above the deck's target. */
  aboveTargetInline: "above your target",

  // BRACKET-SPEED (DECKCHECK-STUDY §2.2 and §2.3) — the speed block in the sheet.
  /** The block's heading; its rows are the adapter's words (the facts name card kinds). */
  speed: "How fast it looks",
  /**
   * The block's one sentence, agreeing with the read's assumption line
   * ("Tutors and fast mana don't change the read"): "These show how fast
   * the list looks. They don't change the bracket."
   */
  speedNote: (noun: string) => `These show how fast the list looks. They don't change the ${noun}.`,

  // DECK-PREVIEW-BRACKET (DECKCHECK-STUDY §2.4) — the Share dialog's line: what
  // the deck's link preview says about the bracket, in the image's own words.
  /** "Link previews show Bracket 3 (declared)." — the declared label the unfurl draws. */
  previewShows: (declared: string) => `Link previews show ${declared}.`,
  /** No target: the unfurl says nothing about the bracket. */
  previewShowsNone: (noun: string) => `Link previews show no ${noun}.`,
  /** The line's action without a target (with one, `changeGoals`): the Why sheet at Your target. */
  declare: (noun: string) => `Declare a ${noun}`,

  // TARGET-CHANGES (the owner's ask of 2026-10-24) — the callout under Your
  // target's choice: what one pick did, starting with what it didn't do.
  /** A target where there was none: "Target set: Bracket 3 (Upgraded)". */
  targetSet: (level: string) => `Target set: ${level}`,
  /** "Target changed from Bracket 2 to Bracket 3", "to" between them (U9's range word). */
  targetChanged: (from: string, to: string) => `Target changed from ${from} to ${to}`,
  targetCleared: "Target cleared",
  /** Always the callout's first line: a target never edits the list. */
  cardsUnchanged: "Your cards didn't change.",
  /** The polite status, kept short: the title and the first line, never the whole callout. */
  changeStatus: (title: string) => `${title}. Your cards didn't change.`,
  /**
   * The list against the new target, from the read the sheet renders, and
   * (`was`) the count at the old one when it moved: "Nothing in the list
   * puts the deck above it (before, 3 did).", "2 things in the list put the
   * deck above it. See Above your target below."
   */
  aboveNow: (n: number, was: number | null) => {
    const before = was === null ? "" : ` (before, ${was === 0 ? "none" : was} did)`;
    return n === 0
      ? `Nothing in the list puts the deck above it${before}.`
      : `${things(n)} in the list ${n === 1 ? "puts" : "put"} the deck above it${before}. See ${ABOVE_TARGET} below.`;
  },
  /** Cleared, when something was above the old target: "Nothing is marked above a target now (before, 3 things were)." */
  aboveCleared: (was: number) =>
    `Nothing is marked above a target now (before, ${was === 1 ? "1 thing was" : `${things(was)} were`}).`,
  /** Before a newly set target's rows: "What Bracket 3 allows:". */
  allowsLead: (level: string) => `What ${level} allows:`,
  /** Before a changed target's rows, only the ones that differ: "Where Bracket 3 differs from Bracket 2:". */
  differsLead: (to: string, from: string) => `Where ${to} differs from ${from}:`,
  /** After a row's new value, the old level's, verbatim: "Game Changers: Up to three (was None)". */
  was: (value: string) => `(was ${value})`,
  /**
   * The tools that follow a target, by the names the editor shows them
   * under: the Suggestions tab, More's "Autofill…", the Card tab's
   * Alternatives (Swap Lab, with its Swap… doors), the Combos tab (the
   * Combo Radar).
   */
  toolSuggestions: "Suggestions",
  toolAutofill: "Autofill",
  toolSwap: "Alternatives",
  toolCombos: "Combos tab",
  /**
   * What the tools the game declares do with the target: "Suggestions,
   * Autofill and Alternatives leave out cards above it, and the Combos tab
   * marks combos above it." `combos` is the Combos tab's name, or null.
   */
  toolsFollow: (cards: readonly string[], combos: string | null) =>
    sentence([
      cards.length > 0
        ? `${andList(cards)} ${cards.length === 1 ? "leaves" : "leave"} out cards above it`
        : null,
      combos ? `the ${combos} marks combos above it` : null,
    ]),
  /** Cleared: "Suggestions, Autofill and Alternatives stop leaving out cards for a target, and the Combos tab stops marking combos above one." */
  toolsStop: (cards: readonly string[], combos: string | null) =>
    sentence([
      cards.length > 0
        ? `${andList(cards)} ${cards.length === 1 ? "stops" : "stop"} leaving out cards for a target`
        : null,
      combos
        ? `the ${combos} stops marking combos above ${cards.length > 0 ? "one" : "a target"}`
        : null,
    ]),
  /**
   * Where a set or changed target shows, by `targetShown`'s rule (link
   * previews only when they draw it, never for a private deck), in the
   * present tense: an already-posted preview keeps its picture.
   */
  targetShowsAt: (level: string, previews: boolean) =>
    previews
      ? `${level} shows on your share page, in link previews and where the deck is listed.`
      : `${level} shows on your share page and where the deck is listed.`,
  /** Cleared, by the same rule: "No target shows on your share page or where the deck is listed." */
  targetShowsNone: (previews: boolean) =>
    previews
      ? "No target shows on your share page, in link previews or where the deck is listed."
      : "No target shows on your share page or where the deck is listed.",
  /** Puts the previous target back; answers and exceptions stay as they are. */
  undo: "Undo",
  /** The callout's own close ("Close" is the sheet's). */
  dismiss: "Dismiss",
} as const;

/**
 * The goals line's parts (Y6a): the target in the level's own words, then
 * the per-card budget's label — "Bracket 2 (Core)", "≤ $5 a card". Empty
 * when neither is set. Y8: then the deck total's phrase when one is set
 * ("est. $212 of your $150", built by the caller — a price, not a bracket
 * word, so it stays out of this table and its guard).
 */
export function goalsParts(
  brackets: Pick<BracketsMeta, "noun" | "levels"> | undefined,
  goals: { targetLevel?: number; budget?: { perCardUsd?: number; totalUsd?: number } } | null,
  budgetLabel: (perCardUsd: number) => string,
  totalLabel?: (totalUsd: number) => string,
): string[] {
  const parts: string[] = [];
  if (brackets && goals?.targetLevel !== undefined) {
    parts.push(levelLabel(brackets, goals.targetLevel));
  }
  if (goals?.budget?.perCardUsd !== undefined) parts.push(budgetLabel(goals.budget.perCardUsd));
  if (totalLabel && goals?.budget?.totalUsd !== undefined) {
    parts.push(totalLabel(goals.budget.totalUsd));
  }
  return parts;
}

/** "Bracket" — the adapter's noun, capitalized (the /precons filter's label, LATER row 151). */
export function nounLabel(brackets: Pick<BracketsMeta, "noun">): string {
  return brackets.noun.charAt(0).toUpperCase() + brackets.noun.slice(1);
}

/**
 * "Bracket 3 (declared)" — the owner's target on tiles and unfurls (Y5,
 * D6): declared, never computed, and said so. DECK-PREVIEW-BRACKET: the
 * Share dialog quotes it, so the dialog and the image say the same words.
 */
export function declaredLabel(brackets: Pick<BracketsMeta, "noun">, level: number): string {
  return `${nounLabel(brackets)} ${level} (declared)`;
}

/** "Bracket 3": the adapter's noun, capitalized, and the level's number (TARGET-CHANGES' short form). */
export function levelNumberLabel(brackets: Pick<BracketsMeta, "noun">, level: number): string {
  return `${nounLabel(brackets)} ${level}`;
}

/** "Bracket 3 (Upgraded)" — the adapter's noun, capitalized, and the level's name. */
export function levelLabel(brackets: Pick<BracketsMeta, "noun" | "levels">, level: number): string {
  const noun = nounLabel(brackets);
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
