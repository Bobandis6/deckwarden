/**
 * The record (Y10, WAVE4 D10) — what a deck's logged games add up to, told
 * honestly about small numbers. Pure and isomorphic: the games GET sends
 * the counted cells (every game, not only the recent ones it returns) and
 * the newest lists played; the Games dialog turns them into words here.
 *
 * - **Counts always, judgments gated.** Every group shows its games and
 *   wins; a percentage only from PERCENT_FROM games (5 wins in 20 is a 95%
 *   interval of about 11–47%), and a list with fewer than COMPARE_FROM
 *   games says "Too few games to compare".
 * - **The baseline is the table.** An even N-player table wins 1 in N, so a
 *   pod-size row carries it: Magic's pods vary, One Piece is always 1v1.
 * - **No streaks, no ratings** (D10: nothing stored or shown beyond counts).
 * - Games logged with no list (the played allowance, LATER row 196) count
 *   in every total and sit in their own "No list kept" row — never folded
 *   into a version they weren't played with.
 */
import type { GameResult } from "@/db/schema";

/** A percentage is shown only from this many games (WAVE4 A). */
export const PERCENT_FROM = 10;
/** Below this many games a list says "Too few games to compare" (D10). */
export const COMPARE_FROM = 5;
/** The newest lists played that the games GET describes (with a diff each). */
export const RECORD_LISTS = 10;

/** One counted cell: the games that ended `result` at a `podSize` table on `version`. */
export interface RecordCell {
  /** The version played; null = logged at the played allowance, no list kept. */
  version: number | null;
  podSize: number;
  result: GameResult;
  games: number;
}

/** A list the deck was played with, as the games GET describes it. */
export interface PlayedList {
  version: number;
  /** The list played before it (the next older version with games); null for the first. */
  since: number | null;
  /** `diffSummary(since → version)` ("+2 · -2 · 1 qty"); null without `since`. */
  change: string | null;
}

export interface Tally {
  games: number;
  win: number;
  loss: number;
  draw: number;
}

export interface PodTally extends Tally {
  podSize: number;
}

export interface ListTally extends Tally {
  /** null = the games logged with no list kept. */
  version: number | null;
  since: number | null;
  change: string | null;
}

export interface RecordSummary extends Tally {
  /** By table size, smallest first. */
  pods: PodTally[];
  /** The described lists, newest first, then "No list kept" when any game has none. */
  lists: ListTally[];
  /** Lists played that aren't described (older than the newest RECORD_LISTS). */
  moreLists: number;
}

const empty = (): Tally => ({ games: 0, win: 0, loss: 0, draw: 0 });

function add(t: Tally, cell: RecordCell): void {
  t.games += cell.games;
  t[cell.result] += cell.games;
}

export function summarizeRecord(
  cells: readonly RecordCell[],
  lists: readonly PlayedList[],
): RecordSummary {
  const total = empty();
  const pods = new Map<number, PodTally>();
  const byVersion = new Map<number | null, Tally>();
  for (const cell of cells) {
    if (cell.games <= 0) continue;
    add(total, cell);
    if (!pods.has(cell.podSize)) pods.set(cell.podSize, { podSize: cell.podSize, ...empty() });
    add(pods.get(cell.podSize)!, cell);
    if (!byVersion.has(cell.version)) byVersion.set(cell.version, empty());
    add(byVersion.get(cell.version)!, cell);
  }
  const described = lists
    .filter((l) => byVersion.has(l.version))
    .sort((a, b) => b.version - a.version)
    .map((l) => ({ ...l, ...byVersion.get(l.version)! }));
  const noList = byVersion.get(null);
  const playedVersions = [...byVersion.keys()].filter((v) => v !== null).length;
  return {
    ...total,
    pods: [...pods.values()].sort((a, b) => a.podSize - b.podSize),
    lists: noList
      ? [...described, { version: null, since: null, change: null, ...noList }]
      : described,
    moreLists: playedVersions - described.length,
  };
}

/** The whole-number share of games won — or null below PERCENT_FROM games, where it would mislead. */
export function shownPercent(t: Tally): number | null {
  return t.games >= PERCENT_FROM ? Math.round((t.win / t.games) * 100) : null;
}

/** A list's games are too few to set beside another list's. */
export function tooFewToCompare(t: Tally): boolean {
  return t.games < COMPARE_FROM;
}

/** Per version (History's rows): win / loss / draw, from the same cells. */
export function tallyByVersion(cells: readonly RecordCell[]): Map<number, Tally> {
  const out = new Map<number, Tally>();
  for (const cell of cells) {
    if (cell.version === null || cell.games <= 0) continue;
    if (!out.has(cell.version)) out.set(cell.version, empty());
    add(out.get(cell.version)!, cell);
  }
  return out;
}
