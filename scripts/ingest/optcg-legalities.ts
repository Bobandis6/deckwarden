/**
 * OPTCG banlist overlay applier (P4.2). Reads data/optcg/legalities.json —
 * THE authority for One Piece legality rows (build plan M4: hand-maintained
 * because community scrapers lag Bandai) — and diffs it against the current
 * in-force rows for the OP format: close rows the overlay dropped, open rows
 * it added, leave matches untouched (the scryfall.ts differ pattern, so
 * effective_from/effective_to are honest ban history). Unknown card numbers
 * are a hard error: the overlay is hand-edited, so a typo must fail the run,
 * never half-apply.
 *
 * Runs two ways, applying overlay edits within a day either way:
 *   - nightly: punk-records.ts calls applyOptcgLegalities() unconditionally
 *     BEFORE its sha-skip exit (the overlay changes without upstream commits)
 *   - manually: pnpm ingest:optcg-legalities
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import type postgres from "postgres";
import type { Sql } from "postgres";

import { GAME_ID } from "../../src/db/seed-data";
import {
  diffOverlay,
  parseOverlay,
  type CurrentRow,
} from "../../src/lib/games/optcg/legalities-overlay";

const OVERLAY_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/optcg/legalities.json",
);

export interface OverlayApplyStats {
  entries: number;
  closed: number;
  opened: number;
  unchanged: number;
}

export async function applyOptcgLegalities(sql: Sql): Promise<OverlayApplyStats> {
  const overlay = parseOverlay(JSON.parse(readFileSync(OVERLAY_PATH, "utf8")));

  const [format] = await sql<{ id: number }[]>`
    SELECT id FROM formats
    WHERE game_id = ${GAME_ID.optcg} AND code = ${overlay.format}`;
  if (!format) throw new Error(`overlay: no format row for ${overlay.game}/${overlay.format}`);

  // Resolve card numbers → identity uuids; any miss is a hand-edit typo.
  const cardKeys = [...new Set(overlay.entries.map((e) => e.cardId.toUpperCase()))];
  const idRows = cardKeys.length
    ? await sql<{ id: string; external_key: string }[]>`
        SELECT id, upper(external_key) AS external_key FROM card_identities
        WHERE game_id = ${GAME_ID.optcg} AND upper(external_key) = ANY(${cardKeys})`
    : [];
  const idByKey = new Map(idRows.map((r) => [r.external_key, r.id]));
  const missing = cardKeys.filter((k) => !idByKey.has(k));
  if (missing.length) throw new Error(`overlay: unknown card numbers: ${missing.join(", ")}`);

  const current = await sql<CurrentRow[]>`
    SELECT l.id AS "rowId", upper(ci.external_key) AS "cardId", l.status, l.condition
    FROM legalities l JOIN card_identities ci ON ci.id = l.card_identity_id
    WHERE l.format_id = ${format.id} AND l.effective_to IS NULL`;

  const { closeRowIds, openEntries } = diffOverlay(overlay.entries, current);

  await sql.begin(async (tx) => {
    if (closeRowIds.length) {
      await tx`UPDATE legalities SET effective_to = current_date
        WHERE id = ANY(${closeRowIds})`;
    }
    for (const e of openEntries) {
      await tx`INSERT INTO legalities
          (format_id, card_identity_id, status, condition, effective_from, source, note)
        VALUES (${format.id}, ${idByKey.get(e.cardId.toUpperCase())!}, ${e.status},
                ${e.condition ? tx.json(e.condition as unknown as postgres.JSONValue) : null}, ${e.effectiveFrom},
                ${"bandai:" + e.effectiveFrom}, ${e.note ?? null})`;
    }
  });

  const stats: OverlayApplyStats = {
    entries: overlay.entries.length,
    closed: closeRowIds.length,
    opened: openEntries.length,
    unchanged: overlay.entries.length - openEntries.length,
  };
  console.log(
    `optcg legalities overlay (retrieved ${overlay.retrieved}): ` +
      `${stats.entries} entries → ${stats.opened} opened, ${stats.closed} closed, ${stats.unchanged} unchanged`,
  );
  return stats;
}

// Manual entry point: pnpm ingest:optcg-legalities
async function runStandalone() {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const { default: postgres } = await import("postgres");
  const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)?.replace(
    "-pooler.",
    ".",
  );
  if (!url) throw new Error("DATABASE_URL(_UNPOOLED) not set");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await applyOptcgLegalities(sql);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runStandalone().catch((err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  });
}
