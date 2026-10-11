/**
 * The game journal's IO (Y9a, WAVE4 D10). A logged game always knows the
 * exact list it was played with:
 *
 *   logGame — ONE transaction: lock the deck → freeze the live list and
 *     hash it → stamp any of the deck's versions still unhashed (rows from
 *     before migration 0018, hashed once, here, by the deck's first log) →
 *     reuse the NEWEST version with the same hash (saved or played), or
 *     mint a `played` snapshot noted "Played {date}" → insert the game.
 *     At the played allowance the game still logs: `version` NULL, the
 *     hash kept, `capped` true. Logging never fails for want of room.
 *   deleteGame — under the same lock: the game goes, and a `played`
 *     snapshot goes with its last game. A saved version a game reused is
 *     the owner's and is never touched.
 *   updateGame — the details only; the version and the list never move.
 *
 * Callers (the games routes) have already proved the session, the owner
 * and the adapter's journal declaration.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type { GameResult } from "@/db/schema";
import { LIST_HASH_PREFIX, playableListHash } from "@/lib/decks/list-hash";
import {
  insertVersion,
  loadLiveFrozen,
  lockDeck,
  MAX_PLAYED_SNAPSHOTS_PER_DECK,
  parseFrozenCards,
  PlayedAllowanceError,
} from "@/lib/decks/versions";
import { JOURNAL_COPY } from "@/lib/journal/copy";
import type { GameFields } from "@/lib/journal/check";

const { decks, deckGames, deckVersions } = schema;

/** The most recent games GET returns (Y9a's dialog shows a few; Y10 reads its numbers its own way). */
export const RECENT_GAMES_LIMIT = 50;

/** One game on the wire (owner-only). The list hash stays server-side. */
export interface GameWire {
  id: number;
  version: number | null;
  playedOn: string;
  podSize: number;
  result: GameResult;
  endTurn: number | null;
  tableLevel: number | null;
  seat: number | null;
  opponents: string[][] | null;
  notes: string | null;
  createdAt: string;
}

const GAME_COLUMNS = {
  id: deckGames.id,
  version: deckGames.version,
  playedOn: deckGames.playedOn,
  podSize: deckGames.podSize,
  result: deckGames.result,
  endTurn: deckGames.endTurn,
  tableLevel: deckGames.tableLevel,
  seat: deckGames.seat,
  opponents: deckGames.opponents,
  notes: deckGames.notes,
  createdAt: deckGames.createdAt,
};

type GameRow = Pick<typeof deckGames.$inferSelect, keyof typeof GAME_COLUMNS>;

function toWire(row: GameRow): GameWire {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export interface GamesList {
  games: GameWire[];
  /** Every game the deck has, beyond the recent ones returned. */
  total: number;
  /** Played snapshots the deck keeps now — the allowance's numerator. */
  playedSnapshots: number;
  playedAllowance: number;
}

export async function listGames(deckId: string): Promise<GamesList> {
  const db = getDb();
  const [games, [counts]] = await Promise.all([
    db
      .select(GAME_COLUMNS)
      .from(deckGames)
      .where(eq(deckGames.deckId, deckId))
      .orderBy(desc(deckGames.playedOn), desc(deckGames.id))
      .limit(RECENT_GAMES_LIMIT),
    // Both counts in one statement, read off the deck's own row. The deck id
    // is bound, never correlated: drizzle prints a select list's columns
    // unqualified, and an inner "id" would be deck_games' own.
    db
      .select({
        total: sql<number>`(select count(*)::int from ${deckGames} where ${deckGames.deckId} = ${deckId})`,
        played: sql<number>`(select count(*)::int from ${deckVersions} where ${deckVersions.deckId} = ${deckId} and ${deckVersions.kind} = 'played')`,
      })
      .from(decks)
      .where(eq(decks.id, deckId)),
  ]);
  return {
    games: games.map(toWire),
    total: counts?.total ?? 0,
    playedSnapshots: counts?.played ?? 0,
    playedAllowance: MAX_PLAYED_SNAPSHOTS_PER_DECK,
  };
}

export interface LogResult {
  game: GameWire;
  /** The version the game was played with; null at the played allowance. */
  version: number | null;
  /** A played snapshot was minted for this game (Undo removes it with the game). */
  minted: boolean;
  /** The allowance was full: the game logged without a version of its own. */
  capped: boolean;
}

export async function logGame(deckId: string, game: GameFields): Promise<LogResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockDeck(tx, deckId);
    const live = await loadLiveFrozen(tx, deckId);
    const hash = playableListHash(live);

    // Every version's hash, newest first — and the cards of any still
    // unhashed (a pre-0018 row, or one under an older hash prefix), so they
    // can be stamped here, once, in this transaction.
    const versions = await tx
      .select({
        version: deckVersions.version,
        listHash: deckVersions.listHash,
        cards: sql<unknown>`case when ${deckVersions.listHash} like ${`${LIST_HASH_PREFIX}%`} then null else ${deckVersions.cards} end`,
      })
      .from(deckVersions)
      .where(eq(deckVersions.deckId, deckId))
      .orderBy(desc(deckVersions.version));
    const stamps = versions
      .filter((v) => v.cards !== null)
      .map((v) => ({ version: v.version, hash: playableListHash(parseFrozenCards(v.cards)) }));
    if (stamps.length > 0) {
      const byVersion = sql.join(
        stamps.map((s) => sql`when ${s.version} then ${s.hash}`),
        sql` `,
      );
      await tx
        .update(deckVersions)
        .set({ listHash: sql`case ${deckVersions.version} ${byVersion} end` })
        .where(
          and(
            eq(deckVersions.deckId, deckId),
            inArray(
              deckVersions.version,
              stamps.map((s) => s.version),
            ),
          ),
        );
    }
    const stamped = new Map(stamps.map((s) => [s.version, s.hash]));
    const match = versions.find((v) => (stamped.get(v.version) ?? v.listHash) === hash);

    let version = match?.version ?? null;
    let minted = false;
    let capped = false;
    if (version === null) {
      try {
        ({ version } = await insertVersion(
          tx,
          deckId,
          live,
          JOURNAL_COPY.playedNote(game.playedOn),
          "played",
        ));
        minted = true;
      } catch (err) {
        if (!(err instanceof PlayedAllowanceError)) throw err;
        capped = true;
      }
    }

    const [row] = await tx
      .insert(deckGames)
      .values({ deckId, version, listHash: hash, ...game })
      .returning(GAME_COLUMNS);
    return { game: toWire(row), version, minted, capped };
  });
}

export async function loadGame(deckId: string, gameId: number): Promise<GameWire | null> {
  const db = getDb();
  const [row] = await db
    .select(GAME_COLUMNS)
    .from(deckGames)
    .where(and(eq(deckGames.id, gameId), eq(deckGames.deckId, deckId)))
    .limit(1);
  return row ? toWire(row) : null;
}

export async function updateGame(
  deckId: string,
  gameId: number,
  game: GameFields,
): Promise<GameWire | null> {
  const db = getDb();
  const [row] = await db
    .update(deckGames)
    .set(game)
    .where(and(eq(deckGames.id, gameId), eq(deckGames.deckId, deckId)))
    .returning(GAME_COLUMNS);
  return row ? toWire(row) : null;
}

/**
 * Delete a game; its played snapshot goes too when no other game was
 * played with it. `null` = no such game on this deck.
 */
export async function deleteGame(
  deckId: string,
  gameId: number,
): Promise<{ snapshotRemoved: boolean } | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockDeck(tx, deckId);
    const [gone] = await tx
      .delete(deckGames)
      .where(and(eq(deckGames.id, gameId), eq(deckGames.deckId, deckId)))
      .returning({ version: deckGames.version });
    if (!gone) return null;
    if (gone.version === null) return { snapshotRemoved: false };
    const removed = await tx
      .delete(deckVersions)
      .where(
        and(
          eq(deckVersions.deckId, deckId),
          eq(deckVersions.version, gone.version),
          eq(deckVersions.kind, "played"),
          sql`not exists (select 1 from ${deckGames} where ${deckGames.deckId} = ${deckId} and ${deckGames.version} = ${gone.version})`,
        ),
      )
      .returning({ version: deckVersions.version });
    return { snapshotRemoved: removed.length === 1 };
  });
}
