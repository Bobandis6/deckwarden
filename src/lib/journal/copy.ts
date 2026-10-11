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
