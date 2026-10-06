/**
 * A deck's goals (Y4b, WAVE4 D5) — what the player aims the deck at, kept
 * beside what the cards prove and never mixed into it. One pure,
 * client-safe module for the stored shape, its zod (the target's range off
 * the adapter), the edits the Why sheet makes, and what visitors see.
 *
 * Stored in `decks.goals` (jsonb, nullable — 0 bytes unset):
 *   { v: 1, targetLevel?, budget?: {perCardUsd?, totalUsd?},
 *     answers?: {rulesetVersion, play?, calls?}, exceptions? }
 *
 * - `targetLevel` — the declared level ("Your target"). It never changes
 *   the read; the read only names the findings above it (`conflicts`).
 * - `answers` — the engine's own input (BracketAnswers): "How it plays" by
 *   the adapter's question keys, and the read's open questions by their
 *   stable ids. They only ever raise the read. `rulesetVersion` stamps the
 *   rules they were given under; a newer ruleset flags them
 *   (`read.answersStale`) and still applies them. An answer to a question
 *   that went away (its card was cut) is kept: the question can come back.
 * - `exceptions` — the table's exceptions, the owner's words (≤ 200).
 * - `budget` — accepted and stored now, owner-only on every wire; its
 *   controls are Y6a's.
 *
 * Game-agnostic: the range and the question keys come off the adapter's
 * `brackets` declaration, so a game without one (One Piece) takes no
 * target, no answers and no exceptions — a budget at most.
 *
 * Saved through its own PATCH body `{goals}` — the whole object, null
 * clears — which never bumps `updated_at` (a setting must not reorder the
 * "recent" rails); a draft carries them in its create. Never copied on
 * fork (forks.ts inserts explicit columns) and never set from the read.
 */
import { z } from "zod";

import { BUDGET_OPTIONS } from "@/lib/recommend/budget";
import type { BracketAnswer, BracketAnswers, BracketsMeta } from "@/lib/games/types";

export interface DeckBudget {
  /** One of the site's per-card tiers (budget.ts): 5 or 1. */
  perCardUsd?: number;
  totalUsd?: number;
}

export interface DeckGoals {
  v: 1;
  targetLevel?: number;
  budget?: DeckBudget;
  answers?: BracketAnswers;
  exceptions?: string;
}

/** What a visitor's deck wire carries: the declared target and the table's exceptions. */
export type PublicDeckGoals = Pick<DeckGoals, "v" | "targetLevel" | "exceptions">;

/** The adapter facts goals are checked against. */
export type GoalsBrackets = Pick<BracketsMeta, "levels" | "questions" | "ruleset">;

export const EXCEPTIONS_MAX = 200;
/** Stored answers to the read's questions, at most — answers to off-screen questions go first. */
export const CALLS_MAX = 100;
/**
 * The stored answers' size, at most (their JSON, in characters): a chain of
 * extra turns is asked about by every card in it, so one id can run long.
 */
export const CALLS_MAX_CHARS = 12_000;
/**
 * A question id as the adapters write them — `<kind>:<key>` in a URL-safe
 * alphabet (`land-denial:<oracle id>`, `extra-turns:<id>+<id>+…` — every
 * extra-turn card's oracle id, 37 characters each — `combo:<variant id>`).
 */
const CALL_ID = /^[a-z][a-z-]*:[0-9a-z+-]{1,4000}$/;

const ANSWER = z.enum(["yes", "no", "unsure"]);

/** The per-card tiers the site offers ("≤ $5 a card" → 5); "All" is no budget. */
const PER_CARD_TIERS = BUDGET_OPTIONS.flatMap((o) => (o.value === "all" ? [] : [Number(o.value)]));

const BUDGET = z
  .object({
    perCardUsd: z.number().refine((n) => PER_CARD_TIERS.includes(n), {
      message: `Must be one of ${PER_CARD_TIERS.join(", ")}`,
    }),
    totalUsd: z.number().positive().max(100_000),
  })
  .partial()
  .strict();

/**
 * The stored shape, checked against the deck's game. `brackets` absent
 * (One Piece) → only `v` and a budget pass; a target, answers or exceptions
 * answer 400.
 */
export function goalsSchema(brackets: GoalsBrackets | undefined) {
  const base = { v: z.literal(1), budget: BUDGET.optional() };
  if (!brackets || brackets.levels.length === 0) return z.object(base).strict();
  const levels = brackets.levels.map((l) => l.level);
  const playKeys = brackets.questions.map((q) => q.key);
  return z
    .object({
      ...base,
      targetLevel: z
        .number()
        .int()
        .min(Math.min(...levels))
        .max(Math.max(...levels))
        .optional(),
      answers: z
        .object({
          // 0 is the oldest answer anyone could hold; a version the rules
          // haven't reached yet can't have been answered under.
          rulesetVersion: z.number().int().min(0).max(brackets.ruleset.version),
          play: z.partialRecord(z.enum(playKeys as [string, ...string[]]), ANSWER).optional(),
          calls: z
            .record(z.string().regex(CALL_ID), ANSWER)
            .refine((calls) => Object.keys(calls).length <= CALLS_MAX, {
              message: `At most ${CALLS_MAX} answers`,
            })
            .refine((calls) => JSON.stringify(calls).length <= CALLS_MAX_CHARS, {
              message: `At most ${CALLS_MAX_CHARS} characters of answers`,
            })
            .optional(),
        })
        .strict()
        .optional(),
      exceptions: z.string().trim().min(1).max(EXCEPTIONS_MAX).optional(),
    })
    .strict();
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A stored or wire value as goals; anything this version doesn't recognise reads as none. */
export function readGoals(value: unknown): DeckGoals | null {
  return isObject(value) && value.v === 1 ? (value as unknown as DeckGoals) : null;
}

/** Drop what says nothing — empty answer maps, an empty budget — and goals with nothing left. */
export function normalizeGoals(goals: DeckGoals | null): DeckGoals | null {
  if (!goals) return null;
  const out: DeckGoals = { v: 1 };
  if (goals.targetLevel !== undefined) out.targetLevel = goals.targetLevel;
  if (goals.budget) {
    const budget: DeckBudget = {};
    if (goals.budget.perCardUsd !== undefined) budget.perCardUsd = goals.budget.perCardUsd;
    if (goals.budget.totalUsd !== undefined) budget.totalUsd = goals.budget.totalUsd;
    if (Object.keys(budget).length > 0) out.budget = budget;
  }
  if (goals.answers) {
    const { rulesetVersion, play, calls } = goals.answers;
    const answers: BracketAnswers = { rulesetVersion };
    if (play && Object.keys(play).length > 0) answers.play = play;
    if (calls && Object.keys(calls).length > 0) answers.calls = calls;
    if (answers.play || answers.calls) out.answers = answers;
  }
  if (goals.exceptions) out.exceptions = goals.exceptions;
  return Object.keys(out).length > 1 ? out : null;
}

/** "Your target": a level, or null for "Not set". */
export function withTarget(goals: DeckGoals | null, level: number | null): DeckGoals | null {
  const next: DeckGoals = { ...(goals ?? { v: 1 }) };
  if (level === null) delete next.targetLevel;
  else next.targetLevel = level;
  return normalizeGoals(next);
}

/**
 * One answer — "How it plays" (`play`, by the adapter's key) or one of the
 * read's questions (`calls`, by its id). Answering is reviewing: every
 * answer is stamped with the rules it was given under. Past CALLS_MAX
 * answers, or CALLS_MAX_CHARS of them, the answers to questions no longer
 * on screen (`live`) are dropped, first in the stored order — jsonb keeps
 * its own key order, so "first" means first in that order, not the oldest.
 */
export function withAnswer(
  goals: DeckGoals | null,
  kind: "play" | "calls",
  key: string,
  answer: BracketAnswer,
  opts: { rulesetVersion: number; live?: readonly string[] },
): DeckGoals | null {
  const answers = goals?.answers;
  const map = { ...(answers?.[kind] ?? {}) };
  delete map[key]; // re-inserted last, so it is never the one dropped below
  map[key] = answer;
  if (kind === "calls") {
    const live = new Set(opts.live ?? []);
    const fits = () =>
      Object.keys(map).length <= CALLS_MAX && JSON.stringify(map).length <= CALLS_MAX_CHARS;
    for (const id of Object.keys(map)) {
      if (fits()) break;
      if (id !== key && !live.has(id)) delete map[id];
    }
  }
  return normalizeGoals({
    ...(goals ?? { v: 1 }),
    answers: { ...answers, rulesetVersion: opts.rulesetVersion, [kind]: map },
  });
}

/** "Keep my answers": the same answers, reviewed under the current rules. */
export function restampAnswers(goals: DeckGoals | null, rulesetVersion: number): DeckGoals | null {
  if (!goals?.answers) return goals;
  return normalizeGoals({ ...goals, answers: { ...goals.answers, rulesetVersion } });
}

/** The exceptions line as typed: stored trimmed, and an empty line is none. */
export function withExceptions(goals: DeckGoals | null, text: string): DeckGoals | null {
  const next: DeckGoals = { ...(goals ?? { v: 1 }) };
  const trimmed = text.trim().slice(0, EXCEPTIONS_MAX);
  if (trimmed) next.exceptions = trimmed;
  else delete next.exceptions;
  return normalizeGoals(next);
}

/**
 * What a visitor's deck wire carries: the target and the exceptions. Never
 * the budget (the owner's), and never the answers: which answers changed
 * the read can only be told from the read (the cards and their combo
 * facts), which the deck routes don't compute — Y5's share page does, and
 * shows those. Every stored answer would also tell the list's history
 * (answers to questions about cards since cut).
 */
export function publicGoals(goals: DeckGoals | null): PublicDeckGoals | null {
  if (!goals) return null;
  const out: PublicDeckGoals = { v: 1 };
  if (goals.targetLevel !== undefined) out.targetLevel = goals.targetLevel;
  if (goals.exceptions) out.exceptions = goals.exceptions;
  return Object.keys(out).length > 1 ? out : null;
}

/** Every object's keys sorted, at every depth. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

/**
 * The goals PATCH body — and, serialized the same way, the editor's dirty
 * check. Canonical (keys sorted at every depth): Postgres' jsonb hands
 * objects back in its own key order (shortest key first), so goals read
 * back after a reload must still compare equal to the same goals edited
 * in place.
 */
export function goalsPatchBody(goals: DeckGoals | null): string {
  return JSON.stringify({ goals: canonical(normalizeGoals(goals)) });
}
