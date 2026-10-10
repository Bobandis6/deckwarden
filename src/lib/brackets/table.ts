/**
 * At the table (Y5, WAVE4 D6) — the share page's bracket read, said to the
 * pod, and the text the owner pastes anywhere. Pure and client-safe: the
 * share page runs it on the server (from the full row, so only the answers
 * the read used ever leave it) and DeckShareView runs it again on the
 * client (the private gate's facts land there), over the same inputs the
 * editor's read takes — so the read is the editor's read.
 *
 * - `tableBracket` — the read (the adapter's `assess`, with the owner's
 *   target and answers), the line's context in the table's voice ("Played
 *   as …", "the owner's answers"), and the goals the page may show
 *   (goals.ts' `tableGoals`). Null where there is no read: a game without
 *   `brackets` (One Piece) or a list without a commander.
 * - `tableSummary` — "At the table"'s rows: the adapter's evidence rows,
 *   then what the owner said (How it plays, the read's questions they
 *   answered, the table's exceptions).
 * - `tableText` — D6's "Copy for the table": the deck and its format, the
 *   line with the date its evidence was checked, every row with its named
 *   source, the owner's plan (their description, never generated), the
 *   adapter's closing note, and the link. A line with nothing to say is
 *   left out, never printed as "none" for something the owner didn't say.
 */
import { BRACKET_COPY, dateLabel } from "@/lib/brackets/copy";
import {
  toEditorCard,
  type CardWire,
  type EditorCard,
  type EditorEntry,
} from "@/lib/decks/editor-state";
import { publicGoals, tableGoals, type DeckGoals, type TableDeckGoals } from "@/lib/decks/goals";
import { hasLeader } from "@/lib/decks/panel-view";
import { cardsToGoPhrase, deckProgress } from "@/lib/decks/progress";
import { toDeckSnapshot } from "@/lib/decks/validation";
import type {
  BracketFreshness,
  BracketLineContext,
  BracketRead,
  BracketsMeta,
  CompleteCombo,
  FormatDef,
  GameAdapter,
} from "@/lib/games/types";

export interface TableBracket {
  read: BracketRead;
  /** The line's context, in the table's voice. */
  ctx: BracketLineContext;
  /** What of the owner's goals the page shows (target, exceptions, the answers the read used). */
  goals: TableDeckGoals | null;
}

export function tableBracket({
  adapter,
  format,
  entries,
  cards,
  combos,
  freshness,
  goals,
  voice = "table",
}: {
  adapter: GameAdapter;
  format: FormatDef;
  entries: readonly EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  combos: readonly CompleteCombo[] | null;
  freshness: BracketFreshness | null;
  /** The owner's goals — the full row's on the server, the table's (or the owner's own, in the private gate) on the client. */
  goals: DeckGoals | null;
  /**
   * "table" (a user deck: the owner's target, answers and calls, said to the
   * pod) or "owner" (a precon — no owner, no goals: the reader is the one
   * who'd play it, so the editor's own words, "two combos are your call").
   */
  voice?: "owner" | "table";
}): TableBracket | null {
  const brackets = adapter.brackets;
  if (!brackets || !hasLeader(entries, format)) return null;
  const deck = toDeckSnapshot(adapter.id, format, entries);
  const read = brackets.assess({
    deck,
    cards,
    combos,
    freshness,
    targetLevel: goals?.targetLevel ?? null,
    answers: goals?.answers ?? null,
  });
  return {
    read,
    ctx: {
      deck,
      cards,
      progress: cardsToGoPhrase(deckProgress(entries, format).toGo),
      targetLevel: goals?.targetLevel ?? null,
      voice,
    },
    goals: tableGoals(
      goals,
      read,
      brackets.questions.map((q) => q.key),
    ),
  };
}

/**
 * What of the owner's goals a public share page sends (Y5) — computed on
 * the server from the full row, so nothing else leaves it: the target and
 * the exceptions, and with the page's own facts the answers the read used
 * (tableGoals). For the owner too: the page shows what the pod sees.
 * Without the server's facts (a failed load, no read for the game) the
 * answers can't be told apart, so none is sent — never every answer.
 */
export function shareGoals({
  fmt,
  cards,
  goals,
  facts,
}: {
  fmt: { adapter: GameAdapter; format: FormatDef } | null;
  cards: readonly { cardId: string; zone: string; qty: number; tags: string[]; card: CardWire }[];
  goals: DeckGoals | null;
  facts: { combos: readonly CompleteCombo[] | null; freshness: BracketFreshness | null } | null;
}): TableDeckGoals | null {
  if (!goals?.answers || !fmt || !facts) return publicGoals(goals);
  const shown = tableBracket({
    adapter: fmt.adapter,
    format: fmt.format,
    entries: cards.map((c) => ({ cardId: c.cardId, zone: c.zone, qty: c.qty, tags: c.tags })),
    cards: new Map(cards.map((c) => [c.cardId, toEditorCard(c.card)])),
    combos: facts.combos,
    freshness: facts.freshness,
    goals,
  });
  return shown ? shown.goals : publicGoals(goals);
}

/** A read the pod can use: not a draft, not blocked (the list says why above). */
export function hasTableRead(read: BracketRead): boolean {
  return read.status === "read" || read.status === "review" || read.status === "unavailable";
}

/** One line of "At the table": its label, and the cards (each item one card or a combo's pieces) or the text. */
export interface TableLine {
  id: string;
  label: string;
  items: string[][];
  /** Shown when there are no items. */
  text: string;
}

export function tableSummary(
  brackets: BracketsMeta,
  read: BracketRead,
  goals: TableDeckGoals | null,
  names: ReadonlyMap<string, { name: string }>,
): TableLine[] {
  const lines: TableLine[] = brackets
    .table(read)
    .map((row) => ({ id: row.id, label: row.label, items: row.items, text: row.empty }));
  const play = goals?.answers?.play ?? {};
  for (const q of brackets.questions) {
    const answer = play[q.key];
    if (!q.table || (answer !== "yes" && answer !== "no")) continue;
    lines.push({ id: `play:${q.key}`, label: q.table.label, items: [], text: q.table[answer] });
  }
  const calls = goals?.answers?.calls ?? {};
  for (const q of read.review) {
    const answer = calls[q.id];
    if (answer !== "yes" && answer !== "no") continue;
    const said = answer === "yes" ? BRACKET_COPY.yes : BRACKET_COPY.no;
    const cardNames = q.cards.flatMap((id) => names.get(id)?.name ?? []);
    const join = q.combo !== undefined ? " + " : ", ";
    lines.push({
      id: `call:${q.id}`,
      label: BRACKET_COPY.ownersCall,
      items: [],
      text: `${q.question} ${said}${cardNames.length > 0 ? ` — ${cardNames.join(join)}` : ""}`,
    });
  }
  if (goals?.exceptions) {
    lines.push({
      id: "exceptions",
      label: BRACKET_COPY.exceptionsOwner,
      items: [],
      text: goals.exceptions,
    });
  }
  return lines;
}

/** The longest plan line the copied text carries (the description's first paragraph). */
export const PLAN_MAX = 280;

/** The owner's plan: the description's first paragraph, on one line, cut at a word past PLAN_MAX. */
export function planLine(description: string | null): string | null {
  const first = (description ?? "")
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, " ")
    .trim();
  if (!first) return null;
  if (first.length <= PLAN_MAX) return first;
  const cut = first.slice(0, PLAN_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > PLAN_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * What separates a line's items: ", " — or "; " once an item is a combo or
 * a name holds a comma ("Gorma, the Gullet + Viscera Seer; Gorma, the
 * Gullet + Woe Strider"), where commas would run the items together.
 */
export function itemSeparator(
  line: Pick<TableLine, "items">,
  names: ReadonlyMap<string, { name: string }>,
): string {
  const ambiguous = line.items.some(
    (item) => item.length > 1 || item.some((id) => names.get(id)?.name.includes(",")),
  );
  return ambiguous ? "; " : ", ";
}

/** A line's value: its cards' names (a combo's pieces joined with " + "), or its text. */
export function lineValue(line: TableLine, names: ReadonlyMap<string, { name: string }>): string {
  if (line.items.length === 0) return line.text;
  return line.items
    .map((item) => item.map((id) => names.get(id)?.name ?? "").join(" + "))
    .join(itemSeparator(line, names));
}

/** D6's "Copy for the table". */
export function tableText({
  deckName,
  formatLabel,
  line,
  checkedAt,
  timeZone = "UTC",
  lines,
  names,
  plan,
  note,
  url,
}: {
  deckName: string;
  formatLabel: string;
  /** The share page's bracket line (the table's voice). */
  line: string;
  /** When the read's evidence was read (the facts' `freshness.readAt`); null = say no date. */
  checkedAt: string | null;
  /**
   * The zone the checked date is said in — the viewer's own: the text is
   * built in the browser on a click and read where it's pasted. Default UTC.
   */
  timeZone?: string;
  lines: readonly TableLine[];
  names: ReadonlyMap<string, { name: string }>;
  /** The owner's description — the plan line; null = none. */
  plan: string | null;
  /** The adapter's closing line. */
  note: string;
  url: string;
}): string {
  const plain = planLine(plan);
  return [
    `${deckName} — ${formatLabel}`,
    checkedAt ? `${line} · ${BRACKET_COPY.checked(dateLabel(checkedAt, timeZone))}` : line,
    ...lines.map((l) => `${l.label}: ${lineValue(l, names)}`),
    ...(plain ? [`${BRACKET_COPY.planOwner}: ${plain}`] : []),
    note,
    url,
  ].join("\n");
}
