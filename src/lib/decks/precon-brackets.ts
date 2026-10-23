/**
 * The /precons bracket read (LATER row 151, WAVE4 F) — pure: one precon's
 * read from the page's batched facts (precons.ts' loadPreconBracketFacts),
 * said the way its share page says it. The share page builds a precon's
 * line through tableBracket in the owner's voice (a precon has no owner
 * and no goals: the reader is the one who'd play it) and BracketLine words
 * it through bracketLineView with its facts' state; this does the same over
 * the same inputs, so a tile and its share page always agree. The bands
 * (the adapter's `brackets.bands`) are the filter's key.
 *
 * Past FACTS_MAX_IDS distinct cards the share page asks for no combos
 * ("over": the read says it couldn't check them); a Commander list never
 * gets there, and this mirrors it all the same.
 *
 * BRACKETS-PAGE: `preconSpread` counts the same reads for the /brackets
 * guide, so its example and the tiles never disagree.
 */
import { FACTS_MAX_IDS, factsIds } from "@/lib/brackets/facts";
import { bracketLineView } from "@/lib/brackets/line-view";
import { tableBracket } from "@/lib/brackets/table";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { PreconBracketFacts } from "@/lib/decks/precons";
import type {
  BracketBand,
  BracketFreshness,
  BracketRead,
  CompleteCombo,
  FormatDef,
  GameAdapter,
} from "@/lib/games/types";

export interface PreconBracket {
  /** The share page's bracket line, word for word ("Bracket 1 to 2 · nothing here goes past Core"). */
  line: string;
  /** The bands the read falls in, lowest first; empty when the line names no level. */
  bands: BracketBand[];
  /** The read itself (the guide's reasons read its factors). */
  read: BracketRead;
}

/** One precon's read; null where the share page shows no line (a game without brackets, a list without a commander). */
export function preconBracket({
  adapter,
  format,
  entries,
  cards,
  combos,
  freshness,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  entries: readonly EditorEntry[];
  /** Every card the list holds (the page's map holds every precon's). */
  cards: ReadonlyMap<string, EditorCard>;
  /** The list's complete combos. */
  combos: readonly CompleteCombo[];
  freshness: BracketFreshness | null;
}): PreconBracket | null {
  const brackets = adapter.brackets;
  if (!brackets) return null;
  const over = factsIds(entries).length > FACTS_MAX_IDS;
  const table = tableBracket({
    adapter,
    format,
    entries,
    cards,
    combos: over ? null : combos,
    freshness,
    goals: null,
    voice: "owner",
  });
  if (!table) return null;
  return {
    line: bracketLineView(brackets, table.read, table.ctx, over ? "over" : "ready").text,
    bands: brackets.bands(table.read),
    read: table.read,
  };
}

/** The guide's precon spread (BRACKETS-PAGE): every precon's read, counted. */
export interface PreconSpread {
  /** The precons read (a list without a commander has no line and isn't counted). */
  total: number;
  /** Each line the tiles say, with how many say it: lowest band first, then the most precons; lines naming no level last. */
  lines: { line: string; count: number }[];
  /** The lowest band any precon reads ("1 to 2"): what `reasons` lift a precon past. Null when none has a band. */
  base: BracketBand | null;
  /** The precons with at least one of the adapter's reasons. */
  past: number;
  /** Each reason with how many precons hold it, the most first; a precon can hold more than one. */
  reasons: { reason: string; count: number }[];
}

/**
 * Every precon's read from the page's batched facts, counted for the guide:
 * the lines exactly as the tiles say them, and the adapter's reasons
 * (`brackets.guide.reasons`) over each read that names a level, a blocked
 * list's factors left out. Null for a game without brackets.
 */
export function preconSpread({
  adapter,
  format,
  facts,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  facts: PreconBracketFacts;
}): PreconSpread | null {
  const brackets = adapter.brackets;
  if (!brackets) return null;
  const lines = new Map<string, { count: number; level: number }>();
  const reasons = new Map<string, number>();
  let total = 0;
  let past = 0;
  let base: BracketBand | null = null;
  for (const [deckId, entries] of facts.entries) {
    const bracket = preconBracket({
      adapter,
      format,
      entries,
      cards: facts.cards,
      combos: facts.combos.get(deckId) ?? [],
      freshness: facts.freshness,
    });
    if (!bracket) continue;
    total++;
    const lowest = bracket.bands[0];
    const row = lines.get(bracket.line);
    if (row) row.count++;
    else lines.set(bracket.line, { count: 1, level: lowest?.level ?? Infinity });
    if (!lowest) continue;
    if (!base || lowest.level < base.level) base = lowest;
    const why = brackets.guide?.reasons(bracket.read) ?? [];
    if (why.length > 0) past++;
    for (const reason of why) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const byText = (a: string, b: string) => a.localeCompare(b, "en");
  return {
    total,
    lines: [...lines]
      .sort(([a, x], [b, y]) => x.level - y.level || y.count - x.count || byText(a, b))
      .map(([line, { count }]) => ({ line, count })),
    base,
    past,
    reasons: [...reasons]
      .sort(([a, x], [b, y]) => y - x || byText(a, b))
      .map(([reason, count]) => ({ reason, count })),
  };
}
