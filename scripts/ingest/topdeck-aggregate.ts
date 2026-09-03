/**
 * IO half of the commander×card tournament aggregate (P3.8), shared by the
 * nightly Topdeck ingest (scripts/ingest/topdeck.ts — the settled-day
 * increment) and the one-shot raw-archive build/rebuild
 * (scripts/ingest/topdeck-aggregate-backfill.ts). The roll-up itself is pure
 * and unit-tested (src/lib/tournaments/aggregate.ts); this module owns the
 * resolver maps and the exactly-once transaction.
 *
 * Exactly-once: only tournaments whose cards_aggregated_at IS NULL are
 * rolled up, and the stats upserts + the marker UPDATE commit in ONE
 * transaction — a crash between them cannot double count, and re-running
 * the same input is a no-op. Settledness (start_date strictly older than the
 * trailing re-fetch window) is the CALLER's filter; this module trusts the
 * lists it is given and gates only on the marker.
 */
import type postgres from "postgres";

import { normalizeCardName } from "../../src/lib/cards/normalize";
import {
  makeListCardResolver,
  rollUpLists,
  type DatedList,
  type ListCardMaps,
} from "../../src/lib/tournaments/aggregate";
import type { StandingListCards } from "../../src/lib/games/mtg/topdeck-map";
import { GAME_ID } from "../../src/db/seed-data";

/**
 * Nightly overlap re-fetched because results settle after events end — and
 * therefore the aggregate's settled boundary (an event older than this never
 * re-enters the fetch window, so its lists can be counted exactly once).
 * Lives here so the fetch window (topdeck.ts) and the settled cutoff can
 * never disagree.
 */
export const TRAILING_REFETCH_DAYS = 14;

/**
 * Resolver maps over ALL identities (not the ingest's leaders-only map):
 * oracle id (external_key), exact name_norm, and per-face names from
 * attrs.faces. Popularity order makes duplicate-name collisions
 * deterministic (most-played identity wins), matching the leader map.
 */
export async function loadListCardMaps(sql: postgres.Sql): Promise<ListCardMaps> {
  const rows = await sql<{ external_key: string; name_norm: string; id: string }[]>`
    SELECT external_key, name_norm, id::text AS id FROM card_identities
    WHERE game_id = ${GAME_ID.mtg} AND NOT is_removed
    ORDER BY popularity ASC NULLS LAST`;
  const byExternalKey = new Map<string, string>();
  const byNameNorm = new Map<string, string>();
  for (const r of rows) {
    if (!byExternalKey.has(r.external_key)) byExternalKey.set(r.external_key, r.id);
    if (!byNameNorm.has(r.name_norm)) byNameNorm.set(r.name_norm, r.id);
  }

  const faceRows = await sql<{ id: string; face_names: string[] | null }[]>`
    SELECT id::text AS id,
           ARRAY(SELECT jsonb_array_elements(attrs->'faces')->>'name') AS face_names
    FROM card_identities
    WHERE game_id = ${GAME_ID.mtg} AND NOT is_removed
      AND jsonb_typeof(attrs->'faces') = 'array'
    ORDER BY popularity ASC NULLS LAST`;
  const byFaceNorm = new Map<string, string>();
  for (const r of faceRows) {
    for (const face of r.face_names ?? []) {
      if (!face) continue;
      const norm = normalizeCardName(face);
      if (!byFaceNorm.has(norm)) byFaceNorm.set(norm, r.id);
    }
  }
  return { byExternalKey, byNameNorm, byFaceNorm };
}

/** Composed entry resolver (id → exact name → face name, never trgm). */
export function listCardResolver(maps: ListCardMaps) {
  return makeListCardResolver(maps, normalizeCardName);
}

/** One mapped tournament's aggregate-relevant slice, as either script collects it. */
export interface AggregateInput {
  external_key: string;
  /** ISO start date — the caller has already filtered to SETTLED events. */
  start_date: string;
  lists: StandingListCards[];
}

export interface AggregateOutcome {
  /** Events marked cards_aggregated_at this call (zero-list ones included). */
  tournaments_aggregated: number;
  /** Events in the input that don't exist in the tournaments table (counted, skipped). */
  tournaments_missing: number;
  card_lists_aggregated: number;
  pair_rows_upserted: number;
  commander_rows_upserted: number;
}

const BATCH = 1000;

/**
 * Roll the given settled tournaments into commander_card_stats /
 * commander_stats, exactly once each. Input may freely overlap already-
 * aggregated events (the nightly's trailing re-fetch does) — the marker
 * filters them out.
 */
export async function aggregateSettledTournaments(
  sql: postgres.Sql,
  input: readonly AggregateInput[],
): Promise<AggregateOutcome> {
  const outcome: AggregateOutcome = {
    tournaments_aggregated: 0,
    tournaments_missing: 0,
    card_lists_aggregated: 0,
    pair_rows_upserted: 0,
    commander_rows_upserted: 0,
  };
  if (input.length === 0) return outcome;

  // = ANY(param) throughout, never `IN ${sql(list)}`: the sql(array) helper
  // is postgres.js's IDENTIFIER builder in these positions (the dispatched
  // 2026-09-03 run died on it with "str.replace is not a function"), while
  // an array VALUE param serializes cleanly at any size.
  const byKey = new Map(input.map((t) => [t.external_key, t]));
  const keys = [...byKey.keys()];
  const pending = await sql<{ id: number; external_key: string }[]>`
    SELECT id, external_key FROM tournaments
    WHERE source = 'topdeck' AND cards_aggregated_at IS NULL
      AND external_key = ANY(${keys})`;
  const found = new Set(pending.map((r) => r.external_key));
  // Distinguish "already aggregated" (fine, skip silently) from "not in the
  // tournaments table at all" (should not happen — counted loudly).
  const allKnown = await sql<{ external_key: string }[]>`
    SELECT external_key FROM tournaments
    WHERE source = 'topdeck' AND external_key = ANY(${keys})`;
  for (const r of allKnown) found.add(r.external_key);
  outcome.tournaments_missing = keys.filter((k) => !found.has(k)).length;

  if (pending.length === 0) return outcome;

  const datedLists: DatedList[] = [];
  for (const row of pending) {
    const t = byKey.get(row.external_key)!;
    for (const list of t.lists) {
      datedLists.push({ ...list, startDate: t.start_date });
    }
  }
  const { pairs, commanders } = rollUpLists(datedLists);

  await sql.begin(async (tx) => {
    // No table alias next to the row helper: `INSERT INTO t AS s ${tx(rows)}`
    // breaks postgres.js's helper-type inference (it stops reading "insert"
    // and escapes the rows as identifiers — the same str.replace crash as
    // the IN case above). DO UPDATE references the table by full name.
    for (let i = 0; i < pairs.length; i += BATCH) {
      await tx`
        INSERT INTO commander_card_stats ${tx(pairs.slice(i, i + BATCH))}
        ON CONFLICT (leader_ids, card_identity_id) DO UPDATE SET
          lists = commander_card_stats.lists + excluded.lists,
          top4 = commander_card_stats.top4 + excluded.top4,
          first_seen = least(commander_card_stats.first_seen, excluded.first_seen),
          last_seen = greatest(commander_card_stats.last_seen, excluded.last_seen)`;
    }
    for (let i = 0; i < commanders.length; i += BATCH) {
      await tx`
        INSERT INTO commander_stats ${tx(commanders.slice(i, i + BATCH))}
        ON CONFLICT (leader_ids) DO UPDATE SET
          lists = commander_stats.lists + excluded.lists,
          first_seen = least(commander_stats.first_seen, excluded.first_seen),
          last_seen = greatest(commander_stats.last_seen, excluded.last_seen)`;
    }
    await tx`
      UPDATE tournaments SET cards_aggregated_at = now()
      WHERE id = ANY(${pending.map((r) => r.id)})`;
  });

  outcome.tournaments_aggregated = pending.length;
  outcome.card_lists_aggregated = datedLists.length;
  outcome.pair_rows_upserted = pairs.length;
  outcome.commander_rows_upserted = commanders.length;
  return outcome;
}
