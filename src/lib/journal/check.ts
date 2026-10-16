/**
 * What a logged game may say (Y9a, WAVE4 D10): the routes' zod bodies, then
 * the adapter's `journal` declaration applied to the whole game. Pure —
 * the games routes call it; the dialog builds its choices from the same
 * declaration, so a game it offers always passes.
 */
import { z } from "zod";

import { GAME_RESULTS } from "@/db/schema";
import type { JournalMeta } from "@/lib/games/types";

/** A game's fields as stored (camelCase) — what the adapter's checks read. */
export interface GameFields {
  playedOn: string;
  podSize: number;
  result: (typeof GAME_RESULTS)[number];
  endTurn: number | null;
  tableLevel: number | null;
  seat: number | null;
  opponents: string[][] | null;
  notes: string | null;
}

export const MAX_GAME_NOTES_LENGTH = 500;
/** The earliest date a game may carry — before any card game this site knows. */
const EARLIEST_PLAYED_ON = "1993-01-01";

/** A calendar date the way <input type="date"> sends it, and a real one (no Feb 30). */
const PLAYED_ON = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  }, "Not a calendar date")
  .refine((d) => d >= EARLIEST_PLAYED_ON, "Too early");

/**
 * An opponent's leader as the game's external key (Magic: a Scryfall oracle
 * id; One Piece: a printed id like OP15-058) — shape only here; Y9b's
 * suggest box is what picks them.
 */
const OPPONENT_KEY = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/);

const FIELDS = {
  playedOn: PLAYED_ON,
  podSize: z.number().int().min(1).max(20),
  result: z.enum(GAME_RESULTS),
  endTurn: z.number().int().min(1).max(99).nullable(),
  tableLevel: z.number().int().min(0).max(20).nullable(),
  seat: z.number().int().min(1).max(20).nullable(),
  opponents: z.array(z.array(OPPONENT_KEY).min(1).max(4)).max(19).nullable(),
  notes: z
    .string()
    .trim()
    .max(MAX_GAME_NOTES_LENGTH)
    .nullable()
    .transform((v) => (v ? v : null)),
};

/** POST: a result and a pod size; everything else optional (the date defaults to today). */
export const LOG_BODY = z
  .object({
    result: FIELDS.result,
    podSize: FIELDS.podSize,
    playedOn: FIELDS.playedOn.optional(),
    endTurn: FIELDS.endTurn.optional(),
    tableLevel: FIELDS.tableLevel.optional(),
    seat: FIELDS.seat.optional(),
    opponents: FIELDS.opponents.optional(),
    notes: FIELDS.notes.optional(),
  })
  .strict();

/** PATCH: any of the fields, at least one; the version and the list never change. */
export const PATCH_BODY = z
  .object({
    result: FIELDS.result.optional(),
    podSize: FIELDS.podSize.optional(),
    playedOn: FIELDS.playedOn.optional(),
    endTurn: FIELDS.endTurn.optional(),
    tableLevel: FIELDS.tableLevel.optional(),
    seat: FIELDS.seat.optional(),
    opponents: FIELDS.opponents.optional(),
    notes: FIELDS.notes.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");

/** URL segment → game id; anything that isn't a plain positive integer is a 404. */
export function parseGameParam(raw: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/** "YYYY-MM-DD" for a moment, in UTC — the server's "today" when a log names no date. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The game's date may run one day past the server's UTC today: a player
 * east of UTC logs "today" before UTC gets there.
 */
export function playedOnTooLate(playedOn: string, now: Date): boolean {
  return playedOn > utcDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

/** The adapter's checks over a whole game; the first problem, or null. */
export function journalIssue(meta: JournalMeta, game: GameFields): string | null {
  const { pod } = meta;
  if (game.podSize < pod.min || game.podSize > pod.max) {
    return pod.min === pod.max
      ? `A game here has ${pod.min} players`
      : `A game here has ${pod.min} to ${pod.max} players`;
  }
  if (game.seat !== null && !meta.seats(game.podSize).some((s) => s.seat === game.seat)) {
    return `Seat must be 1 to ${game.podSize}`;
  }
  if (game.tableLevel !== null) {
    if (!meta.tableLevel) return "This game has no table level";
    if (!meta.tableLevel.levels.some((l) => l.level === game.tableLevel)) {
      const levels = meta.tableLevel.levels;
      return `The ${meta.tableLevel.noun} must be ${levels[0].level} to ${levels[levels.length - 1].level}`;
    }
  }
  if (game.opponents !== null) {
    if (game.opponents.length > game.podSize - 1) {
      return `At most ${game.podSize - 1} opponent${game.podSize === 2 ? "" : "s"} at a ${game.podSize}-player table`;
    }
    if (game.opponents.some((o) => o.length > meta.opponentLeaders)) {
      return meta.opponentLeaders === 1
        ? "An opponent names one leader"
        : `An opponent names at most ${meta.opponentLeaders} leaders`;
    }
  }
  return null;
}
