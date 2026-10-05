/**
 * The bracket line's and the Why sheet's own words (Y4a, WAVE4 D0 and D5) —
 * core's, beside the adapter's (the read's sentences and its line). One
 * table, so D0's copy guard (copy.test.ts) reads every string: none says
 * "approve" (the Warden's word stays legality-only) and none names a
 * Commander Spellbook tag (bracket numbers lead). Game-agnostic: the noun
 * and the level names come off the adapter's `brackets` declaration.
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
} as const;

/** "Bracket 3 (Upgraded)" — the adapter's noun, capitalized, and the level's name. */
export function levelLabel(brackets: Pick<BracketsMeta, "noun" | "levels">, level: number): string {
  const noun = brackets.noun.charAt(0).toUpperCase() + brackets.noun.slice(1);
  const name = brackets.levels.find((l) => l.level === level)?.name;
  return name ? `${noun} ${level} (${name})` : `${noun} ${level}`;
}

/** "Feb 9, 2026" — pinned to UTC, like every date a client component renders. */
export function dateLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
