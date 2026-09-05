/**
 * Limitless tournament importer for One Piece (P4.5, build plan line 216).
 *
 * topdeck.ts's sibling, deliberately NOT a refactor of it: same division of
 * labor (pure mapper src/lib/games/optcg/limitless-map.ts + this thin IO
 * script), same ingest_runs watermark + TRAILING_REFETCH_DAYS window, same
 * temp-table staging, tuple-compare merges and within-window stale sweep —
 * with source = 'limitless' scoping every row. Runs AFTER punk-records in
 * the nightly Action (leader codes resolve against card_identities
 * .external_key for game 2), or standalone: pnpm ingest:limitless
 *
 * KEYLESS by design (verified live 2026-09-05): the tournament endpoints
 * need no API key — a key only buys rate headroom and the /games deck-rules
 * endpoint. LIMITLESS_API_KEY, when present, is sent as X-Access-Key (the
 * docs' header option — keeps it out of URLs/logs) with ZERO other behavior
 * change; absent or empty means keyless, never a skip.
 *
 * Shape difference from Topdeck: the list endpoint has no date filter, only
 * newest-first pages — so windowing is client-side (page until rows age out
 * of the window), and each kept candidate costs its own /details (+
 * /standings when decklists exist) request. No aggregate step: the OP
 * leader×card aggregate is its own later package (LATER.md) once OP decklist
 * volume is proven; tournaments.cards_aggregated_at stays NULL here.
 *
 * Politeness: real User-Agent, ~6.7s between requests (observed keyless
 * policy "50-in-5min" — this paces to ~45/5min), the ratelimit countdown
 * header honored as a backstop, 429 via Retry-After, transient 5xx/network
 * retried with backoff (topdeck.ts's first-unattended-night lesson).
 *
 * IMPORTANT: uses the DIRECT (non `-pooler`) connection — temp tables and
 * pg_advisory_lock are session state, which transaction-mode pooling breaks.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

import { FORMAT_ID, GAME_ID } from "../../src/db/seed-data";
import {
  assessTournament,
  isStandardFormat,
  mapLimitlessTournament,
  MIN_EVENT_PLAYERS,
  TRAILING_REFETCH_DAYS,
  type LimitlessDetails,
  type LimitlessListRow,
  type StandingRow,
  type StandingSkip,
  type TournamentRow,
  type TournamentSkip,
} from "../../src/lib/games/optcg/limitless-map";

const API_BASE = "https://play.limitlesstcg.com/api";
const USER_AGENT = "Deckwarden/1.0 (https://deckwarden.gg)";
/** First-run window — MTG's 180 days. ~505 listed OP events at observed volume. */
const BACKFILL_DAYS = 180;
/** ~45 requests per 5 minutes against the observed keyless "50-in-5min" policy. */
const REQUEST_GAP_MS = 6700;
const PAGE_LIMIT = 100;
/** Runaway guard only — ~505 rows in 180d means ~6 pages; the date check stops paging. */
const MAX_PAGES = 12;
const MAX_ATTEMPTS = 4;
const TRANSIENT_BACKOFF_MS = 15_000;
/** Session-wide lock id shared by all Deckwarden ingest jobs (see scryfall.ts). */
const INGEST_LOCK_KEY = 7234015309;

const DAY_MS = 86_400_000;

function directUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url.replace("-pooler.", ".");
}

interface Stats {
  window: { start: string; end: string; days: number };
  key_used: boolean;
  requests: number;
  retries: number;
  pages_listed: number;
  listed_rows: number;
  /** List rows outside the window (older boundary-page rows, future-scheduled events). */
  listed_outside_window: number;
  leader_map_size: number;
  /** In-window, deduped list rows — the candidate funnel's mouth. */
  tournaments_seen: number;
  tournaments_kept: number;
  tournament_skips: Partial<Record<TournamentSkip, number>>;
  standings_kept: number;
  standing_skips: Partial<Record<StandingSkip, number>>;
  tournaments_merged: { inserted: number; updated: number };
  standings_merged: { inserted: number; updated: number; stale_deleted: number };
  duration_ms: number;
  db_size_bytes: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `ratelimit: "50-in-5min"; r=49; t=300` → remaining requests + seconds to reset. */
function parseRatelimit(res: Response): { remaining: number; resetS: number } | null {
  const header = res.headers.get("ratelimit");
  if (!header) return null;
  const r = /r=(\d+)/.exec(header);
  const t = /t=(\d+)/.exec(header);
  if (!r || !t) return null;
  return { remaining: Number(r[1]), resetS: Number(t[1]) };
}

/**
 * GET one API path. Retries 429s (Retry-After, else the ratelimit reset) and
 * transient failures with backoff; hard-fails other 4xx (a contract problem
 * retrying can't fix). When the countdown header says the budget is nearly
 * spent, waits out the window — the fixed gap should keep this theoretical.
 */
async function apiGet(
  path: string,
  apiKey: string | undefined,
  stats: Stats,
): Promise<{ parsed: unknown }> {
  const url = `${API_BASE}${path}`;
  for (let attempt = 1; ; attempt++) {
    stats.requests++;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...(apiKey ? { "X-Access-Key": apiKey } : {}),
        },
      });
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      const waitMs = TRANSIENT_BACKOFF_MS * attempt;
      stats.retries++;
      console.log(
        `network error (${err instanceof Error ? err.message : String(err)}) — waiting ${waitMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`,
      );
      await sleep(waitMs);
      continue;
    }
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const resetS = parseRatelimit(res)?.resetS;
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : ((resetS ?? 60) + 2) * 1000;
      stats.retries++;
      console.log(`429 — waiting ${waitMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
      await sleep(waitMs);
      continue;
    }
    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      const waitMs = TRANSIENT_BACKOFF_MS * attempt;
      stats.retries++;
      console.log(`${res.status} — waiting ${waitMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    const limit = parseRatelimit(res);
    if (limit && limit.remaining <= 2) {
      console.log(`ratelimit nearly spent (r=${limit.remaining}) — waiting ${limit.resetS}s`);
      await sleep((limit.resetS + 2) * 1000);
    }
    return { parsed: (await res.json()) as unknown };
  }
}

async function main() {
  // Keyless is the normal mode; an empty CI secret must mean keyless too.
  const apiKey = process.env.LIMITLESS_API_KEY || undefined;
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
      WHERE source = 'limitless' AND status = 'succeeded'
      ORDER BY started_at DESC LIMIT 1`;
    const override = Number(process.env.LIMITLESS_WINDOW_DAYS);
    const sinceLastDays = last
      ? Math.ceil((started - last.started_at.getTime()) / DAY_MS)
      : BACKFILL_DAYS;
    const windowDays = Math.min(
      BACKFILL_DAYS,
      Number.isFinite(override) && override > 0 ? override : sinceLastDays + TRAILING_REFETCH_DAYS,
    );
    const endMs = started;
    const windowStartMs = endMs - windowDays * DAY_MS;
    // A day of slack each side, topdeck-map's WindowBounds move: organizers
    // schedule events ahead (the newest list rows can be future-dated).
    const bounds = { minStartMs: windowStartMs - DAY_MS, maxStartMs: endMs + DAY_MS };

    const [run] = await sql<{ id: number }[]>`
      INSERT INTO ingest_runs (source, status) VALUES ('limitless', 'running') RETURNING id`;
    runId = run.id;

    const stats: Stats = {
      window: {
        start: new Date(windowStartMs).toISOString().slice(0, 10),
        end: new Date(endMs).toISOString().slice(0, 10),
        days: windowDays,
      },
      key_used: apiKey !== undefined,
      requests: 0,
      retries: 0,
      pages_listed: 0,
      listed_rows: 0,
      listed_outside_window: 0,
      leader_map_size: 0,
      tournaments_seen: 0,
      tournaments_kept: 0,
      tournament_skips: {},
      standings_kept: 0,
      standing_skips: {},
      tournaments_merged: { inserted: 0, updated: 0 },
      standings_merged: { inserted: 0, updated: 0, stale_deleted: 0 },
      duration_ms: 0,
      db_size_bytes: 0,
    };
    const skipTournament = (reason: TournamentSkip) => {
      stats.tournament_skips[reason] = (stats.tournament_skips[reason] ?? 0) + 1;
    };
    console.log(
      `window: ${stats.window.start} → ${stats.window.end} (${windowDays}d), ` +
        (apiKey ? "key: X-Access-Key" : "keyless"),
    );

    // Leader resolution map: external_key ("OP14-020") → identity id, leader
    // candidates only. Id-first by construction — external_key is unique per
    // game, so no collision handling is needed (unlike MTG's name path).
    const leaderRows = await sql<{ external_key: string; id: string }[]>`
      SELECT external_key, id::text AS id FROM card_identities
      WHERE game_id = ${GAME_ID.optcg} AND is_leader_candidate AND NOT is_removed`;
    const byCode = new Map<string, string>();
    for (const r of leaderRows) byCode.set(r.external_key.toUpperCase(), r.id);
    stats.leader_map_size = byCode.size;
    console.log(`leader map loaded: ${byCode.size} candidates`);

    // ---- List phase: newest-first pages until rows age out of the window ----
    const candidates: { id: string; players: number | null }[] = [];
    const seenIds = new Set<string>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (stats.requests > 0) await sleep(REQUEST_GAP_MS);
      const { parsed } = await apiGet(
        `/tournaments?game=OP&limit=${PAGE_LIMIT}&page=${page}`,
        apiKey,
        stats,
      );
      if (!Array.isArray(parsed))
        throw new Error(`expected a tournament array, got ${typeof parsed}`);
      const rows = parsed as LimitlessListRow[];
      stats.pages_listed++;
      stats.listed_rows += rows.length;

      let pageHasOlder = false;
      for (const row of rows) {
        const id = typeof row.id === "string" && row.id.length > 0 ? row.id : null;
        const dateMs = typeof row.date === "string" ? Date.parse(row.date) : NaN;
        if (id === null || !Number.isFinite(dateMs)) {
          skipTournament("malformed");
          continue;
        }
        if (dateMs < bounds.minStartMs) {
          stats.listed_outside_window++;
          pageHasOlder = true;
          continue;
        }
        if (dateMs > bounds.maxStartMs) {
          stats.listed_outside_window++;
          continue;
        }
        if (seenIds.has(id)) continue; // paging shifts if events land mid-run
        seenIds.add(id);
        stats.tournaments_seen++;
        // Cheap list-level filters (each saves a /details request); the mapper
        // re-checks both against the details it actually maps.
        if (!isStandardFormat(row.format)) {
          skipTournament("unsupported_format");
          continue;
        }
        const players = typeof row.players === "number" ? row.players : null;
        if (players !== null && players < MIN_EVENT_PLAYERS) {
          skipTournament("too_small");
          continue;
        }
        candidates.push({ id, players });
      }
      console.log(`…page ${page}: ${rows.length} rows (${candidates.length} candidates so far)`);
      if (pageHasOlder || rows.length < PAGE_LIMIT) break;
    }

    // ---- Detail phase: /details (+ /standings when worth it) per candidate ----
    const tournamentRows: TournamentRow[] = [];
    const standingRows: StandingRow[] = [];
    for (const candidate of candidates) {
      await sleep(REQUEST_GAP_MS);
      const { parsed: details } = await apiGet(
        `/tournaments/${encodeURIComponent(candidate.id)}/details`,
        apiKey,
        stats,
      );
      const assessed = assessTournament(details as LimitlessDetails, bounds);
      if (!assessed.ok) {
        skipTournament(assessed.skip);
        continue;
      }
      await sleep(REQUEST_GAP_MS);
      const { parsed: standings } = await apiGet(
        `/tournaments/${encodeURIComponent(candidate.id)}/standings`,
        apiKey,
        stats,
      );
      const mapped = mapLimitlessTournament(details as LimitlessDetails, standings, (code) =>
        byCode.get(code),
      );
      if (!mapped.ok) {
        skipTournament(mapped.skip);
        continue;
      }
      stats.tournaments_kept++;
      stats.standings_kept += mapped.standings.length;
      for (const [reason, count] of Object.entries(mapped.standingSkips)) {
        const key = reason as StandingSkip;
        stats.standing_skips[key] = (stats.standing_skips[key] ?? 0) + count;
      }
      tournamentRows.push(mapped.tournament);
      standingRows.push(...mapped.standings);
    }

    // ---- Merge phase: staging + tuple-compare upserts, topdeck.ts verbatim ----
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

    const tRes = await sql<{ inserted: boolean }[]>`
      INSERT INTO tournaments AS t
        (game_id, format_id, source, external_key, name, start_date, player_count, top_cut)
      SELECT ${GAME_ID.optcg}, ${FORMAT_ID.optcgStandard}, 'limitless',
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
      JOIN tournaments t ON t.source = 'limitless' AND t.external_key = s.external_key
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
      WHERE ts.tournament_id = t.id AND t.source = 'limitless'
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
