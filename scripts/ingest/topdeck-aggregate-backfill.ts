/**
 * One-shot build (and rebuild) of the commander×card tournament aggregate
 * (P3.8) from an archive of raw Topdeck bulk responses — the gzipped chunk
 * files the ingest writes to .topdeck-raw/ and the nightly Action uploads to
 * R2. Usage:
 *
 *   pnpm tsx scripts/ingest/topdeck-aggregate-backfill.ts [raw-dir]
 *
 * (default raw-dir: .topdeck-raw). The initial 180-day backfill's raw files
 * (2026-03-05 → 2026-09-01, 18 chunks) exist only on the owner's machine —
 * ingest_runs row 26 ran locally; R2 holds nightly windows from 2026-09-02 —
 * so the first build runs there. A future rebuild (the LATER pruning row)
 * downloads the R2 archive into a directory and points this script at it.
 *
 * Same roll-up code path as the nightly increment (topdeck-aggregate.ts +
 * the pure src/lib/tournaments/aggregate.ts), same exactly-once gate: only
 * SETTLED events (start_date older than TRAILING_REFETCH_DAYS) with
 * cards_aggregated_at IS NULL are counted, so running this after nightly
 * increments have begun — or twice — double counts nothing.
 *
 * Events in the archive re-mapped as kept but absent from the tournaments
 * table are counted (tournaments_missing) and skipped, never inserted: this
 * script builds the aggregate, the ingest owns the tables. One known drift
 * source, accepted and disclosed: standings resolve against TODAY's identity
 * map, so lists whose commanders failed to resolve at original ingest time
 * (the reversible-name bug's 271 skips) aggregate here even though their
 * standings rows were never stored.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { gunzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

import { GAME_ID } from "../../src/db/seed-data";
import {
  mapTournament,
  type StandingSkip,
  type TopdeckTournament,
  type TournamentSkip,
} from "../../src/lib/games/mtg/topdeck-map";
import { rollUpLists, settledCutoffIso, type DatedList } from "../../src/lib/tournaments/aggregate";
import {
  aggregateSettledTournaments,
  listCardResolver,
  loadListCardMaps,
  TRAILING_REFETCH_DAYS,
  type AggregateInput,
} from "./topdeck-aggregate";

/** Session-wide lock id shared by all Deckwarden ingest jobs (see scryfall.ts). */
const INGEST_LOCK_KEY = 7234015309;

function directUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url.replace("-pooler.", ".");
}

async function main() {
  const rawDir = process.argv[2] ?? ".topdeck-raw";
  const files = readdirSync(rawDir)
    .filter((f) => f.endsWith(".json.gz"))
    .sort();
  if (files.length === 0) throw new Error(`no .json.gz chunk files in ${rawDir}`);

  const started = Date.now();
  const sql = postgres(directUrl(), { max: 1, prepare: false, idle_timeout: 0 });
  let runId: number | undefined;

  try {
    const [{ locked }] = await sql<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${INGEST_LOCK_KEY}) AS locked`;
    if (!locked) {
      console.error("another ingest holds the advisory lock; exiting");
      process.exit(2);
    }

    const [run] = await sql<{ id: number }[]>`
      INSERT INTO ingest_runs (source, status) VALUES ('topdeck-aggregate', 'running') RETURNING id`;
    runId = run.id;

    // Same leader map as the ingest (leaders only, exact, popularity order).
    const leaderRows = await sql<{ name_norm: string; id: string }[]>`
      SELECT name_norm, id::text AS id FROM card_identities
      WHERE game_id = ${GAME_ID.mtg} AND is_leader_candidate AND NOT is_removed
      ORDER BY popularity ASC NULLS LAST`;
    const byNameNorm = new Map<string, string>();
    for (const r of leaderRows) if (!byNameNorm.has(r.name_norm)) byNameNorm.set(r.name_norm, r.id);
    const resolveListCard = listCardResolver(await loadListCardMaps(sql));
    console.log(`maps loaded: ${byNameNorm.size} leader candidates`);

    const stats = {
      files: files.length,
      tournaments_seen: 0,
      tournaments_kept: 0,
      tournament_skips: {} as Partial<Record<TournamentSkip, number>>,
      standings_kept: 0,
      standings_with_lists: 0,
      standing_skips: {} as Partial<Record<StandingSkip, number>>,
      list_cards_seen: 0,
      list_cards_unresolved: 0,
      // Whole-archive roll-up counts (reconciliation against the corpus
      // measurement) — the settled aggregation below writes a subset.
      archive_pairs: 0,
      archive_commander_sets: 0,
      settled_cutoff: settledCutoffIso(started, TRAILING_REFETCH_DAYS),
      tournaments_settled: 0,
      aggregate: {},
      duration_ms: 0,
    };

    const inputs = new Map<string, AggregateInput>();
    const allLists: DatedList[] = [];
    for (const file of files) {
      const raw = JSON.parse(
        gunzipSync(readFileSync(path.join(rawDir, file))).toString(),
      ) as unknown;
      if (!Array.isArray(raw)) throw new Error(`${file}: expected a tournament array`);
      for (const t of raw as TopdeckTournament[]) {
        const tid = typeof t.TID === "string" ? t.TID : undefined;
        if (tid && inputs.has(tid)) continue; // chunk-boundary overlap — first wins
        stats.tournaments_seen++;
        const mapped = mapTournament(t, (norm) => byNameNorm.get(norm), undefined, resolveListCard);
        if (!mapped.ok) {
          stats.tournament_skips[mapped.skip] = (stats.tournament_skips[mapped.skip] ?? 0) + 1;
          continue;
        }
        stats.tournaments_kept++;
        stats.standings_kept += mapped.standings.length;
        stats.standings_with_lists += mapped.standingsWithLists;
        stats.list_cards_seen += mapped.listCards.seen;
        stats.list_cards_unresolved += mapped.listCards.unresolved;
        for (const [reason, count] of Object.entries(mapped.standingSkips)) {
          const key = reason as StandingSkip;
          stats.standing_skips[key] = (stats.standing_skips[key] ?? 0) + count;
        }
        inputs.set(mapped.tournament.external_key, {
          external_key: mapped.tournament.external_key,
          start_date: mapped.tournament.start_date,
          lists: mapped.lists,
        });
        for (const list of mapped.lists) {
          allLists.push({ ...list, startDate: mapped.tournament.start_date });
        }
      }
      console.log(`…${file}: ${stats.tournaments_kept} kept so far`);
    }

    const archiveRollup = rollUpLists(allLists);
    stats.archive_pairs = archiveRollup.pairs.length;
    stats.archive_commander_sets = archiveRollup.commanders.length;

    const settled = [...inputs.values()].filter((t) => t.start_date < stats.settled_cutoff);
    stats.tournaments_settled = settled.length;
    const outcome = await aggregateSettledTournaments(sql, settled);
    stats.aggregate = outcome;
    stats.duration_ms = Date.now() - started;

    await sql`UPDATE ingest_runs
      SET status = 'succeeded', finished_at = now(), stats = ${sql.json(stats as unknown as postgres.JSONValue)}
      WHERE id = ${runId}`;
    console.log(JSON.stringify(stats, null, 2));
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(message);
    if (runId !== undefined) {
      await sql`UPDATE ingest_runs
        SET status = 'failed', finished_at = now(), error = ${message.slice(0, 4000)}
        WHERE id = ${runId}`.catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
