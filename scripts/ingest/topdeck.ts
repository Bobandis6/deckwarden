/**
 * Topdeck.gg tournament importer (P3.5, build plan §5).
 *
 * Same division of labor as the Scryfall/Spellbook jobs: pure mapper
 * (src/lib/games/mtg/topdeck-map.ts, unit-tested) + this thin IO script.
 * Runs AFTER those jobs in the nightly Action (commander names resolve
 * against card_identities.name_norm), or standalone: pnpm ingest:topdeck
 *
 * DORMANT MODE: without TOPDECK_API_KEY this exits 0 with a loud skip — the
 * backup-user-tables.sh precedent — so the pipeline deploys before the owner
 * mints the self-serve key and goes live the night the secret lands. Any
 * error WITH a key is a hard fail (visible red), like the sibling steps.
 *
 * One deliberate difference from the siblings: Scryfall/Spellbook re-read a
 * full bulk export nightly; Topdeck is a paginated API of dated events, so
 * backfill and nightly refresh are ONE parameterized code path over a date
 * window derived from ingest_runs — from the last succeeded topdeck run
 * minus TRAILING_REFETCH_DAYS (results settle late: standings finalize and
 * decklists unlock when events end), capped at BACKFILL_DAYS on first run.
 * Because the window never covers all history, the merge sweeps stale rows
 * only WITHIN re-fetched events — there is no global delete sweep.
 *
 * Politeness: real User-Agent, ≥1.1s between requests (published limit is
 * 100 req/min; bulk queries are documented as more restricted), 429 honored
 * via Retry-After. Raw responses are archived gzipped to .topdeck-raw/ for
 * the workflow's R2 upload step (plan §5: "archive raw responses to R2").
 *
 * IMPORTANT: uses the DIRECT (non `-pooler`) connection — temp tables and
 * pg_advisory_lock are session state, which transaction-mode pooling breaks.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

import { FORMAT_ID, GAME_ID } from "../../src/db/seed-data";
import {
  mapTournament,
  MIN_EVENT_PLAYERS,
  type StandingRow,
  type StandingSkip,
  type TopdeckTournament,
  type TournamentRow,
  type TournamentSkip,
} from "../../src/lib/games/mtg/topdeck-map";

const API_URL = "https://topdeck.gg/api/v2/tournaments";
const USER_AGENT = "Deckwarden/1.0 (https://deckwarden.gg)";
/** First-run window. ~180 days of ≥16-player EDH events (schema.ts has the row math). */
const BACKFILL_DAYS = 180;
/** Nightly overlap re-fetched because results settle after events end. */
const TRAILING_REFETCH_DAYS = 14;
/**
 * Per-request date span — window pagination that no server paging scheme can
 * break. Sized from the live probe (2026-09-01): 7 days of ≥16-player EDH
 * with embedded deckObjs weighed ~20MB, so 10 days keeps responses ~30MB.
 */
const CHUNK_DAYS = 10;
const REQUEST_GAP_MS = 1100;
const MAX_ATTEMPTS = 4;
const RAW_DIR = ".topdeck-raw";
/** Session-wide lock id shared by all Deckwarden ingest jobs (see scryfall.ts). */
const INGEST_LOCK_KEY = 7234015309;

const DAY_S = 86400;

function directUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url.replace("-pooler.", ".");
}

interface Stats {
  window: { start: string; end: string; days: number };
  requests: number;
  retries: number;
  raw_archive_files: number;
  name_map_size: number;
  name_norm_collisions: number;
  tournaments_seen: number;
  tournaments_kept: number;
  tournament_skips: Partial<Record<TournamentSkip, number>>;
  standings_kept: number;
  /** Kept standings that embedded a full card list — the LATER rows' empirical gate. */
  standings_with_lists: number;
  standing_skips: Partial<Record<StandingSkip, number>>;
  tournaments_merged: { inserted: number; updated: number };
  standings_merged: { inserted: number; updated: number; stale_deleted: number };
  duration_ms: number;
  db_size_bytes: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST one date chunk; retries 429s per Retry-After, hard-fails anything else. */
async function fetchChunk(
  apiKey: string,
  startS: number,
  endS: number,
  stats: Stats,
): Promise<{ raw: string; tournaments: TopdeckTournament[] }> {
  const body = JSON.stringify({
    game: "Magic: The Gathering",
    format: "EDH",
    start: startS,
    end: endS,
    participantMin: MIN_EVENT_PLAYERS,
    // Per docs, requesting `decklist` also returns `deckObj` (the structured
    // list whose Commanders section names the commander) when it exists.
    columns: ["name", "decklist", "wins", "draws", "losses"],
  });
  for (let attempt = 1; ; attempt++) {
    stats.requests++;
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body,
    });
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15000;
      stats.retries++;
      console.log(`429 — waiting ${waitMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) throw new Error(`POST ${API_URL} [${startS}..${endS}] → ${res.status}`);
    const raw = await res.text();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed))
      throw new Error(`expected a tournament array, got ${typeof parsed}`);
    return { raw, tournaments: parsed as TopdeckTournament[] };
  }
}

async function main() {
  const apiKey = process.env.TOPDECK_API_KEY;
  if (!apiKey) {
    console.log(
      "TOPDECK_API_KEY not set — SKIPPING Topdeck ingest (dormant).\n" +
        "Mint a self-serve key at https://topdeck.gg (docs: /docs/tournaments-v2) and add it\n" +
        "to .env.local and the repo's Actions secrets to go live. No simulated data, ever.",
    );
    return;
  }

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

    // Watermark: re-fetch everything since the last success, plus the trailing
    // settle window; first run (or a long gap) falls back to the full backfill.
    const [last] = await sql<{ started_at: Date }[]>`
      SELECT started_at FROM ingest_runs
      WHERE source = 'topdeck' AND status = 'succeeded'
      ORDER BY started_at DESC LIMIT 1`;
    const override = Number(process.env.TOPDECK_WINDOW_DAYS);
    const sinceLastDays = last
      ? Math.ceil((started - last.started_at.getTime()) / (DAY_S * 1000))
      : BACKFILL_DAYS;
    const windowDays = Math.min(
      BACKFILL_DAYS,
      Number.isFinite(override) && override > 0 ? override : sinceLastDays + TRAILING_REFETCH_DAYS,
    );
    const endS = Math.floor(started / 1000);
    const windowStartS = endS - windowDays * DAY_S;

    const [run] = await sql<{ id: number }[]>`
      INSERT INTO ingest_runs (source, status) VALUES ('topdeck', 'running') RETURNING id`;
    runId = run.id;

    const stats: Stats = {
      window: {
        start: new Date(windowStartS * 1000).toISOString().slice(0, 10),
        end: new Date(endS * 1000).toISOString().slice(0, 10),
        days: windowDays,
      },
      requests: 0,
      retries: 0,
      raw_archive_files: 0,
      name_map_size: 0,
      name_norm_collisions: 0,
      tournaments_seen: 0,
      tournaments_kept: 0,
      tournament_skips: {},
      standings_kept: 0,
      standings_with_lists: 0,
      standing_skips: {},
      tournaments_merged: { inserted: 0, updated: 0 },
      standings_merged: { inserted: 0, updated: 0, stale_deleted: 0 },
      duration_ms: 0,
      db_size_bytes: 0,
    };
    console.log(`window: ${stats.window.start} → ${stats.window.end} (${windowDays}d)`);

    // Commander resolution map: LEADER CANDIDATES only, by exact name_norm.
    // Leaders-only is product-correct (a standing must join a hub to render)
    // and blocks garbage resolutions; popularity order makes the rare
    // duplicate-name collision deterministic (most-played identity wins).
    const leaderRows = await sql<{ name_norm: string; id: string }[]>`
      SELECT name_norm, id::text AS id FROM card_identities
      WHERE game_id = ${GAME_ID.mtg} AND is_leader_candidate AND NOT is_removed
      ORDER BY popularity ASC NULLS LAST`;
    const byNameNorm = new Map<string, string>();
    for (const r of leaderRows) {
      if (byNameNorm.has(r.name_norm)) stats.name_norm_collisions++;
      else byNameNorm.set(r.name_norm, r.id);
    }
    stats.name_map_size = byNameNorm.size;
    console.log(`leader map loaded: ${byNameNorm.size} candidates`);

    mkdirSync(RAW_DIR, { recursive: true });

    const tournamentRows: TournamentRow[] = [];
    const standingRows: StandingRow[] = [];
    const seenTids = new Set<string>();
    for (
      let chunkStart = windowStartS, i = 0;
      chunkStart < endS;
      chunkStart += CHUNK_DAYS * DAY_S, i++
    ) {
      const chunkEnd = Math.min(chunkStart + CHUNK_DAYS * DAY_S, endS);
      if (i > 0) await sleep(REQUEST_GAP_MS);
      const { raw, tournaments } = await fetchChunk(apiKey, chunkStart, chunkEnd, stats);

      const file = path.join(
        RAW_DIR,
        `topdeck-v2-tournaments-${new Date(chunkStart * 1000).toISOString().slice(0, 10)}-c${i}.json.gz`,
      );
      writeFileSync(file, gzipSync(raw));
      stats.raw_archive_files++;

      for (const t of tournaments) {
        // Chunk boundaries could both include an edge event — first one wins.
        const tid = typeof t.TID === "string" ? t.TID : undefined;
        if (tid && seenTids.has(tid)) continue;
        if (tid) seenTids.add(tid);

        stats.tournaments_seen++;
        // A day of slack each side; anything further out (probe found a
        // future-dated test event) is the API ignoring its own filter.
        const mapped = mapTournament(t, (norm) => byNameNorm.get(norm), {
          minStartSeconds: windowStartS - DAY_S,
          maxStartSeconds: endS + DAY_S,
        });
        if (!mapped.ok) {
          stats.tournament_skips[mapped.skip] = (stats.tournament_skips[mapped.skip] ?? 0) + 1;
          continue;
        }
        stats.tournaments_kept++;
        stats.standings_kept += mapped.standings.length;
        stats.standings_with_lists += mapped.standingsWithLists;
        for (const [reason, count] of Object.entries(mapped.standingSkips)) {
          const key = reason as StandingSkip;
          stats.standing_skips[key] = (stats.standing_skips[key] ?? 0) + count;
        }
        tournamentRows.push(mapped.tournament);
        standingRows.push(...mapped.standings);
      }
      console.log(
        `…chunk ${i}: ${tournaments.length} events (${stats.tournaments_kept} kept so far)`,
      );
    }

    await sql`CREATE TEMP TABLE stage_tournament (
      external_key text, name text, start_date date, player_count smallint, top_cut smallint)`;
    await sql`CREATE TEMP TABLE stage_standing (
      external_key text, placement smallint, player_name text, leader_ids uuid[],
      decklist_url text, wins smallint, draws smallint, losses smallint)`;
    for (let i = 0; i < tournamentRows.length; i += 1000) {
      await sql`INSERT INTO stage_tournament ${sql(tournamentRows.slice(i, i + 1000))}`;
    }
    for (let i = 0; i < standingRows.length; i += 1000) {
      await sql`INSERT INTO stage_standing ${sql(standingRows.slice(i, i + 1000))}`;
    }
    console.log(`staged ${tournamentRows.length} tournaments, ${standingRows.length} standings`);

    // Merge tournaments: update only on real change (tuple compare).
    const tRes = await sql<{ inserted: boolean }[]>`
      INSERT INTO tournaments AS t
        (game_id, format_id, source, external_key, name, start_date, player_count, top_cut)
      SELECT ${GAME_ID.mtg}, ${FORMAT_ID.commander}, 'topdeck',
             s.external_key, s.name, s.start_date, s.player_count, s.top_cut
      FROM stage_tournament s
      ON CONFLICT (source, external_key) DO UPDATE SET
        name = excluded.name, start_date = excluded.start_date,
        player_count = excluded.player_count, top_cut = excluded.top_cut
      WHERE (t.name, t.start_date, t.player_count, t.top_cut)
        IS DISTINCT FROM
            (excluded.name, excluded.start_date, excluded.player_count, excluded.top_cut)
      RETURNING (xmax = 0) AS inserted`;
    stats.tournaments_merged.inserted = tRes.filter((r) => r.inserted).length;
    stats.tournaments_merged.updated = tRes.length - stats.tournaments_merged.inserted;

    const sRes = await sql<{ inserted: boolean }[]>`
      INSERT INTO tournament_standings AS ts
        (tournament_id, placement, player_name, leader_ids, decklist_url, wins, draws, losses)
      SELECT t.id, s.placement, s.player_name, s.leader_ids, s.decklist_url,
             s.wins, s.draws, s.losses
      FROM stage_standing s
      JOIN tournaments t ON t.source = 'topdeck' AND t.external_key = s.external_key
      ON CONFLICT (tournament_id, placement) DO UPDATE SET
        player_name = excluded.player_name, leader_ids = excluded.leader_ids,
        decklist_url = excluded.decklist_url, wins = excluded.wins,
        draws = excluded.draws, losses = excluded.losses
      WHERE (ts.player_name, ts.leader_ids, ts.decklist_url, ts.wins, ts.draws, ts.losses)
        IS DISTINCT FROM
            (excluded.player_name, excluded.leader_ids, excluded.decklist_url, excluded.wins,
             excluded.draws, excluded.losses)
      RETURNING (xmax = 0) AS inserted`;
    stats.standings_merged.inserted = sRes.filter((r) => r.inserted).length;
    stats.standings_merged.updated = sRes.length - stats.standings_merged.inserted;

    // Stale sweep WITHIN re-fetched events only (placements shift as results
    // settle; a standing that left the top 16 must leave the table). Events
    // outside the window are untouched — no global sweep, by design.
    const stale = await sql`
      DELETE FROM tournament_standings ts
      USING tournaments t
      WHERE ts.tournament_id = t.id AND t.source = 'topdeck'
        AND EXISTS (SELECT 1 FROM stage_tournament st WHERE st.external_key = t.external_key)
        AND NOT EXISTS (
          SELECT 1 FROM stage_standing s
          WHERE s.external_key = t.external_key AND s.placement = ts.placement)`;
    stats.standings_merged.stale_deleted = stale.count;

    const [{ size }] = await sql<{ size: string }[]>`
      SELECT pg_database_size(current_database())::text AS size`;
    stats.db_size_bytes = Number(size);
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
