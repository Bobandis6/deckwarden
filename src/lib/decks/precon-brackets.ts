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
 */
import { FACTS_MAX_IDS, factsIds } from "@/lib/brackets/facts";
import { bracketLineView } from "@/lib/brackets/line-view";
import { tableBracket } from "@/lib/brackets/table";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type {
  BracketBand,
  BracketFreshness,
  CompleteCombo,
  FormatDef,
  GameAdapter,
} from "@/lib/games/types";

export interface PreconBracket {
  /** The share page's bracket line, word for word ("Bracket 1 to 2 · nothing here goes past Core"). */
  line: string;
  /** The bands the read falls in, lowest first; empty when the line names no level. */
  bands: BracketBand[];
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
  };
}
