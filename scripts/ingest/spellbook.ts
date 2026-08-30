/**
 * Commander Spellbook combo importer (P2.5, build plan §5).
 *
 * Same contract as the Scryfall job: initial load and nightly refresh are ONE
 * code path — full-bulk upsert with change-skip, idempotent and self-healing.
 * Source is the MIT-licensed bulk export (regenerated upstream on change):
 * one giant JSON object streamed via fetch→gunzip→jsonArrayElements, O(one
 * variant) memory. Lean rows only (Neon budget): pieces, result names,
 * template names, popularity — no steps/prose, no raw JSON.
 *
 * Combos are pure derived card data nothing else references, so the sweep
 * hard-DELETEs variants that left the export (renumbered upstream, banned in
 * Commander, or newly failing a keep-filter) — cascade clears their pieces.
 *
 * Runs AFTER the Scryfall job (pieces resolve against card_identities via
 * oracle_id) in the nightly Action, or standalone: pnpm ingest:spellbook
 *
 * IMPORTANT: uses the DIRECT (non `-pooler`) connection — temp tables and
 * pg_advisory_lock are session state, which transaction-mode pooling breaks.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { Readable } from "node:stream";

import postgres from "postgres";

import { GAME_ID } from "../../src/db/seed-data";
import { jsonArrayElements } from "../../src/lib/ingest/json-array-stream";
import { maybeGunzip } from "../../src/lib/ingest/maybe-gunzip";
import {
  mapVariant,
  type ComboRow,
  type SpellbookVariant,
  type VariantSkip,
} from "../../src/lib/games/mtg/spellbook-map";

const USER_AGENT = "Deckwarden/1.0 (https://deckwarden.gg)";
const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };
const BULK_URL = "https://spellbook-prod.s3.us-east-2.amazonaws.com/variants.json.gz";
const BATCH_SIZE = 1000;
/** Session-wide lock id shared by all Deckwarden ingest jobs (see scryfall.ts). */
const INGEST_LOCK_KEY = 7234015309;

function directUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url.replace("-pooler.", ".");
}

interface Stats {
  variants_seen: number;
  kept: number;
  skipped: Partial<Record<VariantSkip, number>>;
  combos: { inserted: number; updated: number; deleted: number };
  pieces: { staged: number; inserted: number; stale_deleted: number; count_mismatches: number };
  source_last_modified: string | null;
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
      INSERT INTO ingest_runs (source, status) VALUES ('spellbook', 'running') RETURNING id`;
    runId = run.id;

    // oracle_id → card_identities.id for the whole game (~35k rows, a few MB).
    const identityRows = await sql<{ external_key: string; id: string }[]>`
      SELECT external_key, id::text AS id FROM card_identities WHERE game_id = ${GAME_ID.mtg}`;
    const byOracle = new Map(identityRows.map((r) => [r.external_key, r.id]));
    console.log(`oracle map loaded: ${byOracle.size} identities`);

    await sql`CREATE TEMP TABLE stage_combo (
      external_key text, piece_count smallint, ci_mask smallint,
      results text[], templates text[], popularity integer)`;
    await sql`CREATE TEMP TABLE stage_piece (external_key text, card_identity_id uuid)`;

    const stats: Stats = {
      variants_seen: 0,
      kept: 0,
      skipped: {},
      combos: { inserted: 0, updated: 0, deleted: 0 },
      pieces: { staged: 0, inserted: 0, stale_deleted: 0, count_mismatches: 0 },
      source_last_modified: null,
      duration_ms: 0,
      db_size_bytes: 0,
    };

    const res = await fetch(BULK_URL, { headers: HEADERS });
    if (!res.ok || !res.body) throw new Error(`GET ${BULK_URL} → ${res.status}`);
    stats.source_last_modified = res.headers.get("last-modified");
    // fetch may have already decompressed (S3 sends Content-Encoding: gzip);
    // maybeGunzip sniffs the magic bytes instead of trusting the .gz suffix.
    const input = await maybeGunzip(
      Readable.fromWeb(res.body as import("stream/web").ReadableStream),
    );

    let comboBatch: ComboRow[] = [];
    let pieceBatch: { external_key: string; card_identity_id: string }[] = [];
    const flush = async () => {
      if (comboBatch.length) {
        await sql`INSERT INTO stage_combo ${sql(comboBatch)}`;
        comboBatch = [];
      }
      if (pieceBatch.length) {
        await sql`INSERT INTO stage_piece ${sql(pieceBatch)}`;
        stats.pieces.staged += pieceBatch.length;
        pieceBatch = [];
      }
    };

    for await (const element of jsonArrayElements(input, "variants")) {
      stats.variants_seen++;
      const mapped = mapVariant(element as SpellbookVariant, (oid) => byOracle.get(oid));
      if (!mapped.ok) {
        stats.skipped[mapped.skip] = (stats.skipped[mapped.skip] ?? 0) + 1;
        continue;
      }
      stats.kept++;
      comboBatch.push(mapped.combo);
      for (const id of mapped.pieceIds) {
        pieceBatch.push({ external_key: mapped.combo.external_key, card_identity_id: id });
      }
      if (comboBatch.length >= BATCH_SIZE) await flush();
      if (stats.variants_seen % 10000 === 0) console.log(`…${stats.variants_seen} variants`);
    }
    await flush();
    input.destroy(); // the reader stops at the array's ']'; drop the rest of the stream
    console.log(`staged ${stats.kept} combos, ${stats.pieces.staged} pieces`);

    // Merge combos: update only when content actually changed (tuple compare).
    const comboRes = await sql<{ inserted: boolean }[]>`
      INSERT INTO combos AS c (external_key, piece_count, ci_mask, results, templates, popularity)
      SELECT s.external_key, s.piece_count, s.ci_mask, s.results, s.templates, s.popularity
      FROM stage_combo s
      ON CONFLICT (external_key) DO UPDATE SET
        piece_count = excluded.piece_count, ci_mask = excluded.ci_mask,
        results = excluded.results, templates = excluded.templates,
        popularity = excluded.popularity
      WHERE (c.piece_count, c.ci_mask, c.results, c.templates, c.popularity)
        IS DISTINCT FROM
            (excluded.piece_count, excluded.ci_mask, excluded.results, excluded.templates,
             excluded.popularity)
      RETURNING (xmax = 0) AS inserted`;
    stats.combos.inserted = comboRes.filter((r) => r.inserted).length;
    stats.combos.updated = comboRes.length - stats.combos.inserted;

    // Pieces: append new; a variant's card set is fixed by its id, so piece
    // churn under a stable external_key only happens if oracle ids move.
    const pieceIns = await sql`
      INSERT INTO combo_pieces (combo_id, card_identity_id)
      SELECT c.id, s.card_identity_id
      FROM stage_piece s
      JOIN combos c ON c.external_key = s.external_key
      ON CONFLICT DO NOTHING`;
    stats.pieces.inserted = pieceIns.count;
    const pieceStale = await sql`
      DELETE FROM combo_pieces p
      USING combos c
      WHERE p.combo_id = c.id
        AND EXISTS (SELECT 1 FROM stage_combo sc WHERE sc.external_key = c.external_key)
        AND NOT EXISTS (
          SELECT 1 FROM stage_piece s
          WHERE s.external_key = c.external_key
            AND s.card_identity_id = p.card_identity_id)`;
    stats.pieces.stale_deleted = pieceStale.count;

    // Sweep: variants gone from the export (or newly filtered out) leave whole.
    const swept = await sql`
      DELETE FROM combos c
      WHERE NOT EXISTS (SELECT 1 FROM stage_combo s WHERE s.external_key = c.external_key)`;
    stats.combos.deleted = swept.count;

    // Integrity gauge: piece_count must equal the real piece rows everywhere.
    const [{ mismatches }] = await sql<{ mismatches: number }[]>`
      SELECT count(*)::int AS mismatches FROM combos c
      WHERE c.piece_count <> (SELECT count(*) FROM combo_pieces p WHERE p.combo_id = c.id)`;
    stats.pieces.count_mismatches = mismatches;
    if (mismatches > 0) console.warn(`WARNING: ${mismatches} combos with piece-count drift`);

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
