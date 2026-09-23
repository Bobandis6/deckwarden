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
  /** Our event row id — the internal /tournaments/[id] link (W10). */
  tournamentId: number;
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
 * W10: the hub shelves keep the default limit; /tournaments?leader= asks
 * for the full run via ALL_FINISHES_CAP.
 */
export async function loadTopFinishes(
  gameId: number,
  leaderId: string,
  limit: number = TOP_FINISHES_SHOWN,
): Promise<TopFinishes> {
  const rows = await getDb()
    .select({
      tournamentId: tournaments.id,
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
    .limit(limit);

  return {
    finishes: rows.map(({ total: _total, ...row }) => row),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  };
}

/** /tournaments?leader= shows the whole run, capped sanely (one leader's kept finishes, newest first). */
export const ALL_FINISHES_CAP = 100;

/** How many events the /tournaments index lists per game (newest first). */
export const RECENT_EVENTS_SHOWN = 50;

/** A leader as the tournament surfaces name it: hub link when slugged, chips from the mask. */
export interface EventLeaderRef {
  name: string;
  slug: string | null;
  colorsMask: number;
}

export interface RecentTournamentRow {
  id: number;
  externalKey: string;
  name: string;
  /** ISO date string. */
  startDate: string;
  playerCount: number;
  /** The placement-1 standing's leaders — empty when the winner wasn't kept/resolved. */
  winners: EventLeaderRef[];
}

/** postgres.js row shape for the index query (json_agg arrives parsed). */
type RecentTournamentRaw = Record<string, unknown> & {
  id: number;
  external_key: string;
  name: string;
  start_date: string;
  player_count: number;
  winners: { name: string; slug: string | null; colorsMask: number }[];
};

/**
 * The /tournaments index (W10): recent kept events for one game, newest
 * first via `tournaments_game_date`, each with the winner's leader(s) — the
 * D9 "1st: …" line. The winner subquery touches at most one standing per
 * event (unique tournament_id+placement).
 */
export async function loadRecentTournaments(
  gameId: number,
  limit: number = RECENT_EVENTS_SHOWN,
): Promise<RecentTournamentRow[]> {
  const rows = await getDb().execute<RecentTournamentRaw>(sql`
    SELECT t.id, t.external_key, t.name, t.start_date::text AS start_date, t.player_count,
      (SELECT coalesce(json_agg(json_build_object(
                 'name', ci.name, 'slug', ci.slug, 'colorsMask', ci.colors_mask)
               ORDER BY ci.name), '[]')
       FROM ${tournamentStandings} ts
       JOIN card_identities ci ON ci.id = ANY(ts.leader_ids)
       WHERE ts.tournament_id = t.id AND ts.placement = 1) AS winners
    FROM ${tournaments} t
    WHERE t.game_id = ${gameId}
    ORDER BY t.start_date DESC, t.id DESC
    LIMIT ${limit}`);
  return [...rows].map((row) => ({
    id: row.id,
    externalKey: row.external_key,
    name: row.name,
    startDate: row.start_date,
    playerCount: row.player_count,
    winners: row.winners,
  }));
}

export interface TournamentEventStanding {
  placement: number;
  playerName: string | null;
  leaders: EventLeaderRef[];
  decklistUrl: string | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
}

export interface TournamentEvent {
  id: number;
  gameId: number;
  source: string;
  externalKey: string;
  name: string;
  /** ISO date string. */
  startDate: string;
  playerCount: number;
  topCut: number | null;
  standings: TournamentEventStanding[];
}

/** postgres.js standings row for the event loader. */
type EventStandingRaw = Record<string, unknown> & {
  placement: number;
  player_name: string | null;
  leaders: { name: string; slug: string | null; colorsMask: number }[];
  decklist_url: string | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
};

/**
 * One event page (W10): the tournament row + its kept standings in
 * placement order (the live contract, P3.8), leaders resolved to
 * { name, slug, colorsMask } so names link to their hubs. Two statements,
 * deduped across layout/metadata/page by the segment's React cache.
 */
export async function loadTournamentEvent(id: number): Promise<TournamentEvent | null> {
  const [event] = await getDb()
    .select({
      id: tournaments.id,
      gameId: tournaments.gameId,
      source: tournaments.source,
      externalKey: tournaments.externalKey,
      name: tournaments.name,
      startDate: tournaments.startDate,
      playerCount: tournaments.playerCount,
      topCut: tournaments.topCut,
    })
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);
  if (!event) return null;

  const standings = await getDb().execute<EventStandingRaw>(sql`
    SELECT ts.placement, ts.player_name, ts.decklist_url, ts.wins, ts.draws, ts.losses,
      (SELECT coalesce(json_agg(json_build_object(
                 'name', ci.name, 'slug', ci.slug, 'colorsMask', ci.colors_mask)
               ORDER BY ci.name), '[]')
       FROM card_identities ci
       WHERE ci.id = ANY(ts.leader_ids)) AS leaders
    FROM ${tournamentStandings} ts
    WHERE ts.tournament_id = ${id}
    ORDER BY ts.placement ASC`);

  return {
    ...event,
    standings: [...standings].map((row) => ({
      placement: row.placement,
      playerName: row.player_name,
      leaders: row.leaders,
      decklistUrl: row.decklist_url,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
    })),
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
