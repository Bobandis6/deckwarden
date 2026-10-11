/**
 * The journal's words (Y9a, WAVE4 D10) — one table, guarded by copy.test.ts
 * (none says "approve": the Warden's word stays legality-only, D0). Plain
 * words for a casual table: "Logged a win", never notation.
 */
import type { GameResult } from "@/db/schema";

const RESULT_NOUN: Record<GameResult, string> = { win: "a win", loss: "a loss", draw: "a draw" };
const RESULT_WORD: Record<GameResult, string> = { win: "Won", loss: "Lost", draw: "Draw" };

/** "Oct 10, 2026" for a calendar date ("2026-10-10"), read as a date — never shifted by a time zone. */
export function playedDateLabel(playedOn: string, withYear = true): string {
  return new Date(`${playedOn}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** Wins–losses, with the draws only when there are some: "5–6", "5–6–1". */
function score(t: { win: number; loss: number; draw: number }): string {
  return t.draw > 0 ? `${t.win}–${t.loss}–${t.draw}` : `${t.win}–${t.loss}`;
}

/** The score in words: "5 wins, 6 losses, 1 draw". */
function scoreWords(t: { win: number; loss: number; draw: number }): string {
  return [
    `${t.win} ${t.win === 1 ? "win" : "wins"}`,
    `${t.loss} ${t.loss === 1 ? "loss" : "losses"}`,
    ...(t.draw > 0 ? [`${t.draw} ${t.draw === 1 ? "draw" : "draws"}`] : []),
  ].join(", ");
}

export const JOURNAL_COPY = {
  title: "Games",
  logHeading: "Log a game",
  players: "Players",
  resultButton: (result: GameResult) => RESULT_WORD[result],
  moreDetails: "More details",
  date: "Date",
  endTurn: "Turn it ended",
  seat: "Seat",
  notes: "Notes",
  notSet: "Not set",
  /** `/account`'s tile ⋯ (Y9b) — the share page's button is `logHeading`, no ellipsis on a button. */
  logGameMenu: "Log a game…",
  /**
   * The opponents' leaders (Y9b) in the adapter's noun ("Commander" /
   * "Leader"): the field's legend, each box's name, the second box's door.
   */
  opponentsLabel: (noun: string, maxOpponents: number) =>
    maxOpponents === 1 ? `Opponent's ${noun.toLowerCase()}` : `Opponents' ${noun.toLowerCase()}s`,
  opponentBox: (noun: string, n: number, maxOpponents: number) =>
    maxOpponents === 1
      ? `Opponent's ${noun.toLowerCase()}`
      : `Opponent ${n}'s ${noun.toLowerCase()}`,
  secondBox: (noun: string, n: number) => `Opponent ${n}'s second ${noun.toLowerCase()}`,
  addSecond: (noun: string) => `Add a second ${noun.toLowerCase()}`,
  searchLeader: (noun: string) => `Search a ${noun.toLowerCase()}…`,
  removeLeader: (name: string) => `Remove ${name}`,
  /** Typed but never picked: said here, and nothing is sent (a typed name isn't a key). */
  opponentUnpicked: (noun: string) =>
    `Pick the ${noun.toLowerCase()} from the list, or clear the box.`,
  recentHeading: "Recent games",
  noGames: "No games logged yet.",
  loading: "Loading…",
  /** Account-only (D10): a guest deck's dialog and the routes' 400. */
  signIn: "Sign in to keep a game journal",
  signInWhy: "Your games are kept on your account, with the exact list you played.",
  /** The played allowance, disclosed up front (WAVE4 §F: 100 per deck). */
  keepsList: (allowance: number) =>
    `Each game keeps the exact list you played — reused when you've saved or played that list before. History keeps up to ${allowance} played lists per deck; they never count against your saved versions.`,
  /** At the allowance, before logging. */
  atAllowance: (allowance: number) =>
    `This deck keeps ${allowance} played lists — the most it can. A game on a list it hasn't kept yet logs without one.`,
  /** The toast's line when a game logged without a list of its own. */
  capped: (allowance: number) =>
    `This deck already keeps ${allowance} played lists, so this game keeps no list of its own.`,
  logged: (result: GameResult) => `Logged ${RESULT_NOUN[result]}`,
  /** The flush-before-log contract: the snapshot must equal the screen. */
  flushFailed: "Your latest changes didn't save, so the game wasn't logged. Try again.",
  turnRange: "The turn it ended is a whole number from 1 to 99.",
  logFailed: (status: number) => `Couldn't log the game (${status}). Try again.`,
  offline: "Couldn't log the game — check your connection and try again.",
  undoFailed: "Couldn't undo — the game is still logged.",
  loadFailed: (status: number) => `Couldn't load your games (${status}).`,
  /** The note a played snapshot carries in History. */
  playedNote: (playedOn: string) => `Played ${playedDateLabel(playedOn)}`,
  /** History's version delete, refused while a game uses the list. */
  versionInUse: "A logged game was played with this list, so it stays while the game does.",
  /**
   * Y10 — the record. "5–6", or "5–6–1" when any game was a draw (wins,
   * losses, draws — D10's "N games · W–L–D", the draws only when there are
   * some, as History's "Played 3 · 2–1").
   */
  score,
  /** The score in words, for screen readers. */
  scoreWords,
  recordHeading: "Record",
  gamesCount: (n: number) => (n === 1 ? "1 game" : `${n} games`),
  /** "won 42%" — only ever built from 10 games or more (record.ts `shownPercent`). */
  wonPercent: (percent: number) => `won ${percent}%`,
  byPlayers: "By players",
  byList: "By list",
  podLabel: (podSize: number) => `${podSize} players`,
  /** "won 3 of 7", "won 6 of 12 · 50%". */
  wonOf: (win: number, games: number, percent: number | null) =>
    `won ${win} of ${games}${percent !== null ? ` · ${percent}%` : ""}`,
  /** The table's own odds — the honest yardstick for a pod's record. */
  baseline: (podSize: number) => `an even table wins 1 in ${podSize}`,
  baselineSentence: (podSize: number) => `An even table wins 1 in ${podSize}.`,
  /** A list row: "v8, since v7: +2 · -2" (`diffSummary`'s own line), or "v3" for the first. */
  listLabel: (version: number, since: number | null, change: string | null) =>
    since !== null && change !== null ? `v${version}, since v${since}: ${change}` : `v${version}`,
  /** Games logged at the played allowance (LATER row 196). */
  noListKept: "No list kept",
  tooFew: "Too few games to compare",
  moreLists: (n: number) => (n === 1 ? "and 1 earlier list" : `and ${n} earlier lists`),
  /** History's row: "Played 3 · 2–1". */
  playedRow: (t: { games: number; win: number; loss: number; draw: number }) =>
    `Played ${t.games} · ${score(t)}`,
  /** The same row, for screen readers: "Played 3: 2 wins, 1 loss". */
  playedRowWords: (t: { games: number; win: number; loss: number; draw: number }) =>
    `Played ${t.games}: ${scoreWords(t)}`,
  /** Save version, when the screen's list hashes like the newest version's. */
  noCardChangesSince: (version: number) =>
    `No card changes since v${version} (tags and printings aren't compared).`,
  /** A recent game's opponents (row 199): "vs Atraxa, Praetors' Voice; Kraum + Tymna" — "; " because names hold commas. */
  vsLine: (opponents: readonly (readonly string[])[]) =>
    `vs ${opponents.map((o) => o.join(" + ")).join("; ")}`,
  /** Y10 — a recent game, edited. */
  edit: "Edit",
  editGame: (playedOn: string) => `Edit the game of ${playedDateLabel(playedOn, false)}`,
  result: "Result",
  saveEdit: "Save changes",
  cancelEdit: "Cancel",
  deleteGame: "Delete game",
  confirmDelete: "Delete this game? It leaves the record, and this can't be undone.",
  /** The list never moves in an edit (PATCH changes the details only). */
  playedWith: (version: number | null) =>
    version !== null
      ? `Played with v${version} — an edit never changes the list.`
      : "Logged with no list kept — an edit never changes that.",
  editFailed: (status: number) => `Couldn't save the changes (${status}). Try again.`,
  deleteFailed: (status: number) => `Couldn't delete the game (${status}). Try again.`,
  editOffline: "Couldn't reach Deckwarden — check your connection and try again.",
  /** Said under "Recent games" when an edit lands. */
  edited: "Saved the changes to that game.",
  deleted: "Deleted that game.",
  /** One recent game: "Oct 10 · Won · 4 players · v12". */
  gameLine: (game: {
    playedOn: string;
    result: GameResult;
    podSize: number;
    /** The adapter's seat phrase ("went 2nd"), or null when no seat was picked. */
    seatPhrase: string | null;
    version: number | null;
    onePod: boolean;
  }) =>
    [
      playedDateLabel(game.playedOn, false),
      RESULT_WORD[game.result],
      ...(game.onePod ? [] : [`${game.podSize} players`]),
      ...(game.seatPhrase ? [game.seatPhrase] : []),
      game.version !== null ? `v${game.version}` : "no list kept",
    ].join(" · "),
} as const;
