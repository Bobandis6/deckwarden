/**
 * Tournament-results data access (P3.5). Core IO over the game-agnostic
 * tournaments/tournament_standings tables — adapters only declare the credit
 * and event link (capabilities.tournaments), the searchFields/combos seam.
 *
 * The shelf query is the decks_hub move: leader_ids @> containment on a GIN
 * index, so "top finishes for commander X" costs the same as "decks with
 * commander X". Partner pairs match because the pair standing's array
 * CONTAINS the single leader id being viewed — a Tymna/Thrasios finish
 * renders on both partners' hubs.
 *
 * `loadRecentFinishLeaders` (R5a) is the other direction — leaders ranked
 * by their finishes for the homepage shelf — and unnests the same arrays.
 */
import { desc, asc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type { FinishLeaderRow } from "@/lib/home/shelves";

const { tournaments, tournamentStandings } = schema;

/** Shelf size: recent finishes, not a leaderboard — the event link carries the rest. */
export const TOP_FINISHES_SHOWN = 8;

export interface TopFinishRow {
  /** Source event id — feeds capabilities.tournaments.eventUrl. */
  externalKey: string;
  eventName: string;
  /** ISO date string. */
  startDate: string;
  playerCount: number;
  placement: number;
  playerName: string | null;
  /** All commander names on the standing, sorted — partner pairs carry two. */
  leaderNames: string[];
  decklistUrl: string | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
}

export interface TopFinishes {
  finishes: TopFinishRow[];
  total: number;
}

/**
 * Most recent kept finishes (placement ≤ 16 at 16+ player events) for one
 * leader. Game-scoped since P4.5: /c/ passes GAME_ID.mtg, /l/ GAME_ID.optcg
 * — one query, two source pipelines (topdeck / limitless) behind it.
 */
export async function loadTopFinishes(gameId: number, leaderId: string): Promise<TopFinishes> {
  const rows = await getDb()
    .select({
      externalKey: tournaments.externalKey,
      eventName: tournaments.name,
      startDate: tournaments.startDate,
      playerCount: tournaments.playerCount,
      placement: tournamentStandings.placement,
      playerName: tournamentStandings.playerName,
      // 1–2 ids per row and ≤ TOP_FINISHES_SHOWN rows — a subquery beats a join+group here.
      leaderNames: sql<string[]>`(
        SELECT coalesce(array_agg(ci.name ORDER BY ci.name), '{}')
        FROM card_identities ci
        WHERE ci.id = ANY(${tournamentStandings.leaderIds}))`.as("leader_names"),
      decklistUrl: tournamentStandings.decklistUrl,
      wins: tournamentStandings.wins,
      draws: tournamentStandings.draws,
      losses: tournamentStandings.losses,
      total: sql<number>`count(*) over ()`.as("total"),
    })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(
      sql`${tournaments.gameId} = ${gameId}
        AND ${tournamentStandings.leaderIds} @> ARRAY[${leaderId}]::uuid[]`,
    )
    .orderBy(desc(tournaments.startDate), asc(tournamentStandings.placement))
    .limit(TOP_FINISHES_SHOWN);

  return {
    finishes: rows.map(({ total: _total, ...row }) => row),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  };
}

/** postgres.js row shape (snake_case); the index signature is drizzle's execute<T> constraint. */
type FinishLeaderRaw = Record<string, unknown> & {
  id: string;
  name: string;
  slug: string | null;
  external_key: string;
  colors_mask: number;
  attrs: unknown;
  latest: string | null;
  finishes: number | null;
};

/**
 * Leaders for the homepage shelf (R5a): every slugged leader of the game
 * LEFT JOINed to its finish ranking (the `leader_ids` arrays unnested,
 * grouped per leader; newest kept finish first, then how many), so the
 * leaders WITH finishes lead and the rest follow in name order. One
 * statement serves both shelf branches — `opShelf` (lib/home/shelves.ts)
 * keeps only the finish rows when any exist and takes the name-ordered
 * rows as the cold-start shelf otherwise. Reads `tournaments_game_date`
 * for the game, then the standings by event; ~2k One Piece standings today.
 */
export async function loadRecentFinishLeaders(
  gameId: number,
  limit: number,
): Promise<FinishLeaderRow[]> {
  const rows = await getDb().execute<FinishLeaderRaw>(sql`
    WITH finishes AS (
      SELECT unnest(ts.leader_ids) AS leader_id, t.start_date
      FROM ${tournamentStandings} ts
      JOIN ${tournaments} t ON t.id = ts.tournament_id
      WHERE t.game_id = ${gameId}
    ), ranked AS (
      SELECT leader_id, max(start_date)::text AS latest, count(*)::int AS finishes
      FROM finishes
      GROUP BY leader_id
    )
    SELECT ci.id, ci.name, ci.slug, ci.external_key, ci.colors_mask, ci.attrs,
           r.latest, r.finishes
    FROM card_identities ci
    LEFT JOIN ranked r ON r.leader_id = ci.id
    WHERE ci.game_id = ${gameId}
      AND ci.is_leader_candidate
      AND NOT ci.is_removed
      AND ci.slug IS NOT NULL
    ORDER BY r.latest DESC NULLS LAST, r.finishes DESC NULLS LAST, ci.name ASC, ci.external_key ASC
    LIMIT ${limit}`);
  return [...rows].map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    externalKey: row.external_key,
    colorsMask: row.colors_mask,
    attrs: row.attrs,
    latestFinish: row.latest,
    finishes: row.finishes ?? 0,
  }));
}
