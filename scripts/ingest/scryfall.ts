/**
 * Scryfall bulk importer (build plan §5, P0.3).
 *
 * Initial load and nightly refresh are the SAME code path: full-bulk upsert with
 * hash-skip — idempotent and self-healing (a missed night is corrected by the next
 * run, by construction).
 *
 * Pipeline: GET /bulk-data → default_cards URI → stream fetch→(gunzip)→readline,
 * O(1) memory. Rows batch into TEMP staging tables (per-row statements over
 * public-net latency to Neon are unusable), then merge:
 *   - card data: INSERT … ON CONFLICT DO UPDATE … only where content changed
 *   - prices: separate UPDATE (daily churn must never dirty the content hash)
 *
 * IMPORTANT: uses the DIRECT (non `-pooler`) connection — temp tables and
 * pg_advisory_lock are session state, which transaction-mode pooling breaks.
 *
 * Run: pnpm ingest:scryfall
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import postgres from "postgres";

import { GAME_ID } from "../../src/db/seed-data";
import {
  mapIdentity,
  mapPrinting,
  oracleId,
  skipReason,
  type IdentityRow,
  type PrintingRow,
  type ScryfallCard,
} from "../../src/lib/games/mtg/scryfall-map";

const USER_AGENT = "Deckwarden/1.0 (https://deckwarden.gg)";
const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };
const BULK_DATA_URL = "https://api.scryfall.com/bulk-data";
const SETS_URL = "https://api.scryfall.com/sets";
const BATCH_SIZE = 1000;
/** Session-wide lock id shared by all Deckwarden ingest jobs. */
const INGEST_LOCK_KEY = 7234015309;

function directUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  // Neon pooled host → direct host. Temp tables/advisory locks need a real session.
  return url.replace("-pooler.", ".");
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

interface BulkDataEntry {
  type: string;
  /** Gzipped JSONL: one card object per line. */
  jsonl_download_uri: string;
  compressed_size: number;
  updated_at: string;
}

interface SetsPage {
  data: Array<{
    code: string;
    name: string;
    released_at?: string;
    set_type?: string;
    digital?: boolean;
  }>;
  has_more: boolean;
  next_page?: string;
}

type Sql = postgres.Sql;

async function upsertSets(sql: Sql): Promise<Map<string, number>> {
  const rows: SetsPage["data"] = [];
  let url: string | undefined = SETS_URL;
  while (url) {
    const page: SetsPage = await fetchJson<SetsPage>(url);
    rows.push(...page.data);
    url = page.has_more ? page.next_page : undefined;
  }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((s) => ({
      game_id: GAME_ID.mtg,
      code: s.code,
      name: s.name,
      released_at: s.released_at ?? null,
      set_type: s.set_type ?? null,
      digital: s.digital ?? false,
    }));
    await sql`
      INSERT INTO sets ${sql(chunk)}
      ON CONFLICT ON CONSTRAINT sets_game_code DO UPDATE SET
        name = excluded.name, released_at = excluded.released_at,
        set_type = excluded.set_type, digital = excluded.digital`;
  }
  const ids = await sql<{ id: number; code: string }[]>`
    SELECT id, code FROM sets WHERE game_id = ${GAME_ID.mtg}`;
  return new Map(ids.map((r) => [r.code, r.id]));
}

async function createStaging(sql: Sql) {
  await sql`CREATE TEMP TABLE stage_ci (
    game_id smallint, external_key text, name text, name_norm text, primary_type text,
    cost_value smallint, colors_mask smallint, ci_mask smallint,
    is_leader_candidate boolean, popularity integer, is_preview boolean, attrs text)`;
  await sql`CREATE TEMP TABLE stage_cp (
    id uuid, oracle_id text, game_id smallint, set_code text, collector_number text,
    rarity text, finishes text[], has_back boolean, released_at date,
    prices text, content_hash text)`;
  await sql`CREATE TEMP TABLE stage_leg (
    external_key text, format_code text, status text)`;
}

/** Streamed line source for the bulk JSONL file (one card object per line). */
async function* cardLines(uri: string): AsyncGenerator<string> {
  const res = await fetch(uri, { headers: HEADERS });
  if (!res.ok || !res.body) throw new Error(`GET ${uri} → ${res.status}`);
  let input = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  if (new URL(uri).pathname.endsWith(".gz")) input = input.pipe(createGunzip());
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

interface Stats {
  lines: number;
  skipped: Record<string, number>;
  sets: number;
  identities: { staged: number; inserted: number; updated: number };
  printings: { staged: number; inserted: number; updated: number; missing_set: number };
  prices_updated: number;
  legalities: { staged: number; closed: number; opened: number };
  post_pass: {
    identities_removed: number;
    printings_removed: number;
    defaults_cleared: number;
    defaults_set: number;
    cheapest_updated: number;
    images_checked: number;
    image_overrides: number;
  };
  duration_ms: number;
  db_size_bytes: number;
}

async function main() {
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
      INSERT INTO ingest_runs (source, status) VALUES ('scryfall', 'running') RETURNING id`;
    runId = run.id;

    const bulk = await fetchJson<{ data: BulkDataEntry[] }>(BULK_DATA_URL);
    const entry = bulk.data.find((d) => d.type === "default_cards");
    if (!entry) throw new Error("no default_cards entry in /bulk-data");
    console.log(
      `default_cards: ${(entry.compressed_size / 1e6).toFixed(0)}MB gz, updated ${entry.updated_at}`,
    );

    const setIds = await upsertSets(sql);
    console.log(`sets upserted: ${setIds.size}`);
    await createStaging(sql);

    const stats: Stats = {
      lines: 0,
      skipped: {},
      sets: setIds.size,
      identities: { staged: 0, inserted: 0, updated: 0 },
      printings: { staged: 0, inserted: 0, updated: 0, missing_set: 0 },
      prices_updated: 0,
      legalities: { staged: 0, closed: 0, opened: 0 },
      post_pass: {
        identities_removed: 0,
        printings_removed: 0,
        defaults_cleared: 0,
        defaults_set: 0,
        cheapest_updated: 0,
        images_checked: 0,
        image_overrides: 0,
      },
      duration_ms: 0,
      db_size_bytes: 0,
    };
    const todayIso = new Date().toISOString().slice(0, 10);
    const seenOracle = new Set<string>();
    // Formats this game tracks; card.legalities keys match format codes.
    const formats = await sql<{ id: number; code: string; default_legality: string }[]>`
      SELECT id, code, default_legality FROM formats WHERE game_id = ${GAME_ID.mtg}`;
    let ciBatch: IdentityRow[] = [];
    let cpBatch: PrintingRow[] = [];
    let legBatch: { external_key: string; format_code: string; status: string }[] = [];

    const flush = async () => {
      if (ciBatch.length) {
        await sql`INSERT INTO stage_ci ${sql(ciBatch)}`;
        stats.identities.staged += ciBatch.length;
        ciBatch = [];
      }
      if (legBatch.length) {
        await sql`INSERT INTO stage_leg ${sql(legBatch)}`;
        stats.legalities.staged += legBatch.length;
        legBatch = [];
      }
      if (cpBatch.length) {
        await sql`INSERT INTO stage_cp ${sql(cpBatch)}`;
        stats.printings.staged += cpBatch.length;
        cpBatch = [];
      }
    };

    for await (const raw of cardLines(entry.jsonl_download_uri)) {
      const line = raw.trim();
      if (line === "[" || line === "]" || line === "") continue;
      stats.lines++;
      const card = JSON.parse(line.endsWith(",") ? line.slice(0, -1) : line) as ScryfallCard;
      const skip = skipReason(card);
      if (skip) {
        stats.skipped[skip] = (stats.skipped[skip] ?? 0) + 1;
        continue;
      }
      const oid = oracleId(card)!;
      if (!seenOracle.has(oid)) {
        seenOracle.add(oid);
        ciBatch.push(mapIdentity(card, todayIso));
        for (const f of formats) {
          const status = card.legalities?.[f.code];
          if (status) legBatch.push({ external_key: oid, format_code: f.code, status });
        }
      }
      cpBatch.push(mapPrinting(card));
      if (ciBatch.length >= BATCH_SIZE || cpBatch.length >= BATCH_SIZE) await flush();
      if (stats.lines % 20000 === 0) console.log(`…${stats.lines} lines`);
    }
    await flush();
    console.log(
      `staged ${stats.identities.staged} identities, ${stats.printings.staged} printings`,
    );

    // Merge identities: update only when content actually changed (tuple compare).
    const ciRes = await sql<{ inserted: boolean }[]>`
      INSERT INTO card_identities AS ci
        (game_id, external_key, name, name_norm, primary_type, cost_value,
         colors_mask, ci_mask, is_leader_candidate, popularity, is_preview,
         is_removed, attrs, seen_at)
      SELECT s.game_id, s.external_key, s.name, s.name_norm, s.primary_type, s.cost_value,
             s.colors_mask, s.ci_mask, s.is_leader_candidate, s.popularity, s.is_preview,
             false, s.attrs::jsonb, now()
      FROM stage_ci s
      ON CONFLICT (game_id, external_key) DO UPDATE SET
        name = excluded.name, name_norm = excluded.name_norm,
        primary_type = excluded.primary_type, cost_value = excluded.cost_value,
        colors_mask = excluded.colors_mask, ci_mask = excluded.ci_mask,
        is_leader_candidate = excluded.is_leader_candidate,
        popularity = excluded.popularity, is_preview = excluded.is_preview,
        is_removed = false, attrs = excluded.attrs, seen_at = now()
      WHERE (ci.name, ci.name_norm, ci.primary_type, ci.cost_value, ci.colors_mask,
             ci.ci_mask, ci.is_leader_candidate, ci.popularity, ci.is_preview,
             ci.is_removed, ci.attrs)
        IS DISTINCT FROM
            (excluded.name, excluded.name_norm, excluded.primary_type, excluded.cost_value,
             excluded.colors_mask, excluded.ci_mask, excluded.is_leader_candidate,
             excluded.popularity, excluded.is_preview, false, excluded.attrs)
      RETURNING (xmax = 0) AS inserted`;
    stats.identities.inserted = ciRes.filter((r) => r.inserted).length;
    stats.identities.updated = ciRes.length - stats.identities.inserted;

    // Merge printings: content-hash skip. Prices deliberately absent from the update.
    const cpRes = await sql<{ inserted: boolean }[]>`
      INSERT INTO card_printings AS cp
        (id, card_identity_id, game_id, set_id, collector_number, rarity, finishes,
         has_back, released_at, prices, price_updated_at, content_hash, is_removed, seen_at)
      SELECT s.id, ci.id, s.game_id, st.id, s.collector_number, s.rarity, s.finishes,
             s.has_back, s.released_at, s.prices::jsonb, now(), s.content_hash, false, now()
      FROM stage_cp s
      JOIN card_identities ci ON ci.game_id = s.game_id AND ci.external_key = s.oracle_id
      JOIN sets st ON st.game_id = s.game_id AND st.code = s.set_code
      ON CONFLICT (id) DO UPDATE SET
        card_identity_id = excluded.card_identity_id, set_id = excluded.set_id,
        collector_number = excluded.collector_number, rarity = excluded.rarity,
        finishes = excluded.finishes, has_back = excluded.has_back,
        released_at = excluded.released_at, content_hash = excluded.content_hash,
        is_removed = false, seen_at = now()
      WHERE cp.content_hash IS DISTINCT FROM excluded.content_hash OR cp.is_removed
      RETURNING (xmax = 0) AS inserted`;
    stats.printings.inserted = cpRes.filter((r) => r.inserted).length;
    stats.printings.updated = cpRes.length - stats.printings.inserted;

    const [{ missing }] = await sql<{ missing: number }[]>`
      SELECT count(*)::int AS missing FROM stage_cp s
      WHERE NOT EXISTS (SELECT 1 FROM sets st WHERE st.game_id = s.game_id AND st.code = s.set_code)`;
    stats.printings.missing_set = missing;
    if (missing > 0) console.warn(`WARNING: ${missing} printings reference unknown sets`);

    // Prices: separate pass, guarded so unchanged prices write nothing.
    const priceRes = await sql`
      UPDATE card_printings cp
      SET prices = s.prices::jsonb, price_updated_at = now()
      FROM stage_cp s
      WHERE cp.id = s.id AND cp.prices IS DISTINCT FROM s.prices::jsonb`;
    stats.prices_updated = priceRes.count;

    // ---------------- Post-pass (set-based SQL; build plan §5 step 4) ----------------

    // Soft-delete rows not seen this run. Never hard-delete: decks may reference them.
    const remCi = await sql`
      UPDATE card_identities ci SET is_removed = true
      WHERE ci.game_id = ${GAME_ID.mtg} AND NOT ci.is_removed
        AND NOT EXISTS (SELECT 1 FROM stage_ci s WHERE s.external_key = ci.external_key)`;
    stats.post_pass.identities_removed = remCi.count;
    const remCp = await sql`
      UPDATE card_printings p SET is_removed = true
      WHERE p.game_id = ${GAME_ID.mtg} AND NOT p.is_removed
        AND NOT EXISTS (SELECT 1 FROM stage_cp s WHERE s.id = p.id)`;
    stats.post_pass.printings_removed = remCp.count;

    // Default printing per identity: paper > promo/memorabilia > unreleased, newest first.
    // Two passes (clear, then set) so cp_default_one is never transiently violated.
    await sql`CREATE TEMP TABLE tmp_default_winner AS
      SELECT id FROM (
        SELECT p.id, row_number() OVER (
          PARTITION BY p.card_identity_id
          ORDER BY st.digital ASC,
                   (st.set_type IN ('promo', 'memorabilia')) ASC,
                   (p.released_at > current_date) ASC,
                   p.released_at DESC NULLS LAST,
                   p.id
        ) AS rn
        FROM card_printings p
        JOIN sets st ON st.id = p.set_id
        WHERE p.game_id = ${GAME_ID.mtg} AND NOT p.is_removed
      ) ranked WHERE rn = 1`;
    const defCleared = await sql`
      UPDATE card_printings p SET is_default = false
      WHERE p.game_id = ${GAME_ID.mtg} AND p.is_default
        AND (p.is_removed OR NOT EXISTS (SELECT 1 FROM tmp_default_winner w WHERE w.id = p.id))`;
    stats.post_pass.defaults_cleared = defCleared.count;
    const defSet = await sql`
      UPDATE card_printings p SET is_default = true
      FROM tmp_default_winner w WHERE p.id = w.id AND NOT p.is_default`;
    stats.post_pass.defaults_set = defSet.count;

    // cheapest_usd denorm: min across usd variants of non-removed printings.
    const cheap = await sql`
      UPDATE card_identities ci SET cheapest_usd = c.min_usd
      FROM (
        SELECT p.card_identity_id,
               min(LEAST(
                 NULLIF(p.prices->>'usd', '')::numeric,
                 NULLIF(p.prices->>'usd_foil', '')::numeric,
                 NULLIF(p.prices->>'usd_etched', '')::numeric)) AS min_usd
        FROM card_printings p
        WHERE p.game_id = ${GAME_ID.mtg} AND NOT p.is_removed
        GROUP BY p.card_identity_id
      ) c
      WHERE ci.id = c.card_identity_id AND ci.cheapest_usd IS DISTINCT FROM c.min_usd`;
    stats.post_pass.cheapest_updated = cheap.count;

    // Legality differ: exceptions-only dated rows. Sources publish only CURRENT state,
    // so history = diff at ingest: close the old row, insert the new one. Preview cards
    // are skipped entirely so ban history never records spoiler flapping.
    const legClosed = await sql`
      UPDATE legalities l SET effective_to = current_date
      FROM formats f, card_identities ci, stage_leg s
      WHERE l.format_id = f.id AND f.game_id = ${GAME_ID.mtg}
        AND ci.id = l.card_identity_id
        AND ci.external_key = s.external_key AND s.format_code = f.code
        AND l.effective_to IS NULL AND l.condition IS NULL
        AND NOT ci.is_preview
        AND l.status IS DISTINCT FROM s.status`;
    stats.legalities.closed = legClosed.count;
    const legOpened = await sql`
      INSERT INTO legalities (format_id, card_identity_id, status, effective_from, source)
      SELECT f.id, ci.id, s.status, current_date, 'scryfall'
      FROM stage_leg s
      JOIN formats f ON f.game_id = ${GAME_ID.mtg} AND f.code = s.format_code
      JOIN card_identities ci
        ON ci.game_id = ${GAME_ID.mtg} AND ci.external_key = s.external_key
      WHERE NOT ci.is_preview
        AND s.status IS DISTINCT FROM f.default_legality
        AND NOT EXISTS (
          SELECT 1 FROM legalities l
          WHERE l.format_id = f.id AND l.card_identity_id = ci.id
            AND l.effective_to IS NULL AND l.condition IS NULL)`;
    stats.legalities.opened = legOpened.count;

    // Sample-verify derived image URLs; store image_override only on mismatch.
    const sample = await sql<{ id: string }[]>`
      SELECT id::text FROM card_printings
      WHERE game_id = ${GAME_ID.mtg} AND NOT is_removed AND image_override IS NULL
      ORDER BY random() LIMIT 20`;
    for (const { id } of sample) {
      const derived = `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
      const head = await fetch(derived, { method: "HEAD", headers: HEADERS });
      stats.post_pass.images_checked++;
      if (!head.ok) {
        const card = await fetchJson<ScryfallCard>(`https://api.scryfall.com/cards/${id}`);
        const override = {
          front: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null,
          back: card.card_faces?.[1]?.image_uris?.normal ?? null,
        };
        await sql`UPDATE card_printings
          SET image_override = ${sql.json(override)} WHERE id = ${id}`;
        stats.post_pass.image_overrides++;
        console.warn(`image_override written for ${id}`);
      }
      await new Promise((r) => setTimeout(r, 100)); // Scryfall politeness
    }

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
