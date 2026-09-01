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
 */
import { desc, asc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { GAME_ID } from "@/db/seed-data";

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

/** Most recent kept finishes (placement ≤ 16 at 16+ player events) for one leader. */
export async function loadTopFinishes(leaderId: string): Promise<TopFinishes> {
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
      sql`${tournaments.gameId} = ${GAME_ID.mtg}
        AND ${tournamentStandings.leaderIds} @> ARRAY[${leaderId}]::uuid[]`,
    )
    .orderBy(desc(tournaments.startDate), asc(tournamentStandings.placement))
    .limit(TOP_FINISHES_SHOWN);

  return {
    finishes: rows.map(({ total: _total, ...row }) => row),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  };
}
