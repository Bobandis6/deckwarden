/**
 * The IO half of the Tagger flags (Y3a, WAVE4 D3), used by scryfall.ts before
 * staging; the pure half is src/lib/games/mtg/tagger.ts.
 *
 * The oracle_tags bulk is small (~6 MB gzipped, ~19 MB of JSONL), so it is
 * read whole — a promise per step, under one timeout — instead of streamed:
 * every failure (HTTP, network, gzip, a malformed line) lands in one catch and
 * becomes "keep the stored flags", never an unhandled stream error that would
 * fail the Scryfall step.
 */
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

import type postgres from "postgres";

import { GAME_ID } from "../../src/db/seed-data";
import { isMtgRoleKey, MTG_ROLE_KEYS, type MtgRoleKey } from "../../src/lib/games/mtg/roles";
import {
  indexTagLine,
  TAGGER_FLAGS,
  type TagIndex,
  type TaggerFlag,
} from "../../src/lib/games/mtg/tagger";

const gunzipAsync = promisify(gunzip);
const READ_TIMEOUT_MS = 120_000;

export interface TagIndexRead {
  index: TagIndex | null;
  /** The bulk entry's updated_at when the read succeeded. */
  updatedAt: string | null;
  error: string | null;
}

export async function readTagIndex(
  entry: { jsonl_download_uri: string; updated_at: string } | undefined,
  headers: Record<string, string>,
): Promise<TagIndexRead> {
  if (!entry) return { index: null, updatedAt: null, error: "no oracle_tags entry in /bulk-data" };
  try {
    const res = await fetch(entry.jsonl_download_uri, {
      headers,
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GET ${entry.jsonl_download_uri} → ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    // Scryfall serves .gz as opaque bytes; sniff the magic rather than trust headers.
    const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const text = (gz ? await gunzipAsync(bytes) : bytes).toString("utf8");
    const index: TagIndex = new Map();
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (line === "" || line === "[" || line === "]") continue;
      indexTagLine(index, line.endsWith(",") ? line.slice(0, -1) : line);
    }
    return { index, updatedAt: entry.updated_at, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { index: null, updatedAt: null, error: `oracle_tags read failed: ${message}` };
  }
}

/** Oracle ids carrying each flag now — what a failed read keeps. GIN-served containment. */
export async function readStoredFlags(sql: postgres.Sql): Promise<Record<TaggerFlag, Set<string>>> {
  const rows = await sql<{ external_key: string; mld: boolean; extra_turn: boolean }[]>`
    SELECT external_key, attrs ? 'mld' AS mld, attrs ? 'extra_turn' AS extra_turn
    FROM card_identities
    WHERE game_id = ${GAME_ID.mtg} AND NOT is_removed
      AND (attrs @> '{"mld": "clear"}' OR attrs @> '{"mld": "edge"}'
           OR attrs @> '{"extra_turn": true}')`;
  const stored = Object.fromEntries(TAGGER_FLAGS.map((f) => [f, new Set<string>()])) as Record<
    TaggerFlag,
    Set<string>
  >;
  for (const r of rows) {
    if (r.mld) stored.mld.add(r.external_key);
    if (r.extra_turn) stored.extra_turn.add(r.external_key);
  }
  return stored;
}

/** stale_since from the latest successful Scryfall run, carried forward while a flag stays kept. */
export async function readPreviousStaleSince(
  sql: postgres.Sql,
): Promise<Partial<Record<TaggerFlag, string | null>> | null> {
  const [row] = await sql<{ stale_since: unknown }[]>`
    SELECT stats->'tagger'->'stale_since' AS stale_since FROM ingest_runs
    WHERE source = 'scryfall' AND status = 'succeeded'
    ORDER BY started_at DESC LIMIT 1`;
  const value = row?.stale_since;
  if (typeof value !== "object" || value === null) return null;
  const out: Partial<Record<TaggerFlag, string | null>> = {};
  for (const flag of TAGGER_FLAGS) {
    const v = (value as Record<string, unknown>)[flag];
    if (typeof v === "string" || v === null) out[flag] = v;
  }
  return out;
}

/**
 * Oracle ids carrying each Swap Lab role now (Y7a) — what a role that can't
 * be read tonight keeps. `?` isn't served by ci_attrs_gin (jsonb_path_ops),
 * so this is one sequential pass over the game's identities: a nightly batch
 * read, never a request path. A key the adapter no longer declares is
 * dropped (its role was retired, so nothing should keep it).
 */
export async function readStoredRoles(sql: postgres.Sql): Promise<Record<MtgRoleKey, Set<string>>> {
  const rows = await sql<{ external_key: string; roles: unknown }[]>`
    SELECT external_key, attrs->'roles' AS roles
    FROM card_identities
    WHERE game_id = ${GAME_ID.mtg} AND NOT is_removed AND attrs ? 'roles'`;
  const stored = Object.fromEntries(MTG_ROLE_KEYS.map((k) => [k, new Set<string>()])) as Record<
    MtgRoleKey,
    Set<string>
  >;
  for (const r of rows) {
    if (!Array.isArray(r.roles)) continue;
    for (const key of r.roles) if (isMtgRoleKey(key)) stored[key].add(r.external_key);
  }
  return stored;
}

/** Each role's stale_since from the latest successful Scryfall run (Y7a), carried while it stays kept. */
export async function readPreviousRoleStaleSince(
  sql: postgres.Sql,
): Promise<Partial<Record<MtgRoleKey, string | null>> | null> {
  const [row] = await sql<{ stale_since: unknown }[]>`
    SELECT stats->'tagger'->'roles'->'stale_since' AS stale_since FROM ingest_runs
    WHERE source = 'scryfall' AND status = 'succeeded'
    ORDER BY started_at DESC LIMIT 1`;
  const value = row?.stale_since;
  if (typeof value !== "object" || value === null) return null;
  const out: Partial<Record<MtgRoleKey, string | null>> = {};
  for (const key of MTG_ROLE_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" || v === null) out[key] = v;
  }
  return out;
}
