/**
 * TARGET-CHANGES (the owner's ask of 2026-10-24: "when you set a target
 * bracket the changes that it makes pops up and tells you what it auto
 * changed"): what one pick of Your target did, as data, and the words the
 * Why sheet's callout says it in.
 *
 * A target never edits the list. It moves which findings the read marks
 * above it (`read.conflicts`), what the declared level allows (the
 * adapter's guide rows), what the tools that follow it leave out, and what
 * the deck says where it shows. So the change carries:
 *
 * - its kind: set (from Not set), changed (one level to another), cleared;
 * - the findings above the target: `now` from the read the sheet renders
 *   after the pick, `before` from the read at the pick (the caller captures
 *   it then; the read before a first target has no conflicts);
 * - the rows: all of the new level's when there was no target, only those
 *   whose value differs when it changed (with the old value), none when
 *   cleared, and none without a guide. Verbatim, matched by label;
 * - the tools, only those the adapter declares (`targetTools`);
 * - whether link previews draw the target (`targetShown`'s rule).
 *
 * Pure and game-agnostic: every word is BRACKET_COPY's or the adapter's.
 */
import type { BracketRead, BracketsMeta, GameAdapter } from "@/lib/games/types";

import { BRACKET_COPY, levelLabel, levelNumberLabel } from "./copy";

/**
 * A tool that follows the deck's target, in the order the callout names
 * them: Suggestions (`recommend`), Autofill (`recommend.autofill`) and Swap
 * Lab (`recommend.swap`) leave out cards above it; the Combo Radar
 * (`capabilities.combos`) marks combos above it.
 */
export type TargetTool = "suggestions" | "autofill" | "swap" | "combos";

/** One allowance row: the adapter's label and the new level's value, verbatim, and the old level's when it changed. */
export interface TargetAllowanceRow {
  label: string;
  value: string;
  /** The old level's value; null when there was no target to compare with. */
  was: string | null;
}

interface TargetChangeBase {
  /** Findings above the target: in the read the sheet renders now, and in the read at the pick. */
  above: { now: number; before: number };
  rows: TargetAllowanceRow[];
  tools: TargetTool[];
  /** Link previews draw the target (any deck but a private one). */
  linkPreviews: boolean;
}

export type TargetChange =
  | (TargetChangeBase & { kind: "set"; from: null; to: number })
  | (TargetChangeBase & { kind: "changed"; from: number; to: number })
  | (TargetChangeBase & { kind: "cleared"; from: number; to: null });

export type TargetChangeKind = TargetChange["kind"];

/** The tools a game declares that follow its target; empty for a game with none. */
export function targetTools(
  adapter: Pick<GameAdapter, "recommend" | "capabilities">,
): TargetTool[] {
  const tools: TargetTool[] = [];
  if (adapter.recommend) {
    tools.push("suggestions");
    if (adapter.recommend.autofill) tools.push("autofill");
    if (adapter.recommend.swap) tools.push("swap");
  }
  if (adapter.capabilities.combos) tools.push("combos");
  return tools;
}

/** What the new level allows: all its rows, or (from another level) only the ones that differ. */
function allowanceRows(
  guide: BracketsMeta["guide"],
  from: number | null,
  to: number,
): TargetAllowanceRow[] {
  const next = guide?.levels.find((l) => l.level === to);
  if (!next) return [];
  if (from === null) return next.rows.map(({ label, value }) => ({ label, value, was: null }));
  const prev = guide?.levels.find((l) => l.level === from);
  // Without the old level's rows there is nothing to say what differs.
  if (!prev) return [];
  const old = new Map(prev.rows.map((r) => [r.label, r.value]));
  return next.rows.flatMap(({ label, value }) =>
    old.get(label) === value ? [] : [{ label, value, was: old.get(label) ?? null }],
  );
}

/**
 * One pick of Your target, as the callout tells it; null when the pick
 * changed nothing (the level already set).
 */
export function targetChange(input: {
  brackets: Pick<BracketsMeta, "guide">;
  /** `targetTools(adapter)`. */
  tools: readonly TargetTool[];
  from: number | null;
  to: number | null;
  /** The read the sheet renders after the pick. */
  read: Pick<BracketRead, "conflicts">;
  /** `read.conflicts.length` of the read at the moment of the pick. */
  aboveBefore: number;
  linkPreviews: boolean;
}): TargetChange | null {
  const { from, to } = input;
  if (from === to) return null;
  const base = {
    above: { now: input.read.conflicts.length, before: input.aboveBefore },
    tools: [...input.tools],
    linkPreviews: input.linkPreviews,
  };
  if (to === null) return from === null ? null : { ...base, kind: "cleared", from, to, rows: [] };
  const rows = allowanceRows(input.brackets.guide, from, to);
  return from === null
    ? { ...base, kind: "set", from, to, rows }
    : { ...base, kind: "changed", from, to, rows };
}

/** The callout's words for one change, every one BRACKET_COPY's or the adapter's. */
export interface TargetChangeWords {
  /** "Target set: Bracket 3 (Upgraded)", "Target changed from Bracket 2 to Bracket 3", "Target cleared". */
  title: string;
  /** The polite status: the title and "Your cards didn't change." */
  status: string;
  /** "Your cards didn't change." — always, and first. */
  cards: string;
  /** The list against the new target; null when cleared with nothing above the old one. */
  above: string | null;
  /** Before the rows; null when there are none. */
  rowsLead: string | null;
  rows: TargetAllowanceRow[];
  /** What the declared tools do with it; null when the game declares none. */
  tools: string | null;
  /** Where it shows (or no longer does). */
  shown: string;
}

const TOOL_NAMES: Record<Exclude<TargetTool, "combos">, string> = {
  suggestions: BRACKET_COPY.toolSuggestions,
  autofill: BRACKET_COPY.toolAutofill,
  swap: BRACKET_COPY.toolSwap,
};

export function targetChangeWords(
  change: TargetChange,
  brackets: Pick<BracketsMeta, "noun" | "levels">,
): TargetChangeWords {
  const C = BRACKET_COPY;
  const short = (level: number) => levelNumberLabel(brackets, level);
  const { now, before } = change.above;

  const cardTools = change.tools.flatMap((t) => (t === "combos" ? [] : [TOOL_NAMES[t]]));
  const combos = change.tools.includes("combos") ? C.toolCombos : null;
  const said = cardTools.length > 0 || combos !== null;

  if (change.kind === "cleared") {
    const title = C.targetCleared;
    return {
      title,
      status: C.changeStatus(title),
      cards: C.cardsUnchanged,
      above: before > 0 ? C.aboveCleared(before) : null,
      rowsLead: null,
      rows: [],
      tools: said ? C.toolsStop(cardTools, combos) : null,
      shown: C.targetShowsNone(change.linkPreviews),
    };
  }

  const title =
    change.kind === "set"
      ? C.targetSet(levelLabel(brackets, change.to))
      : C.targetChanged(short(change.from), short(change.to));
  const rowsLead =
    change.rows.length === 0
      ? null
      : change.kind === "set"
        ? C.allowsLead(short(change.to))
        : C.differsLead(short(change.to), short(change.from));
  return {
    title,
    status: C.changeStatus(title),
    cards: C.cardsUnchanged,
    // What it was before only when it moved, and never for a first target (no target, no conflicts).
    above: C.aboveNow(now, change.kind === "changed" && before !== now ? before : null),
    rowsLead,
    rows: change.rows,
    tools: said ? C.toolsFollow(cardTools, combos) : null,
    shown: C.targetShowsAt(short(change.to), change.linkPreviews),
  };
}
