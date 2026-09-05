/**
 * Slug assignment for leader candidates (P2.4; OP pass P4.4) — fills
 * `card_identities.slug` for leader candidates that don't have one, so hub
 * URLs exist (/c/[slug] for MTG, /l/[slug] for OP).
 *
 * Runs as an ingest post-pass step (scryfall.ts / punk-records.ts) and
 * stands alone for backfills:
 *
 *   pnpm tsx scripts/ingest/assign-leader-slugs.ts
 *
 * Idempotent and append-only by design: existing slugs are NEVER rewritten
 * (hub URLs must stay stable across renames/errata — the slug is a URL, not
 * a display string), so each run only slugs newcomers. MTG: popularity order
 * on the initial backfill gives well-known commanders the clean slug when two
 * names collide after slugification; later collisions get -2/-3 suffixes.
 * OP: names don't identify leaders (17 Monkey.D.Luffys), so the slug embeds
 * the external key (leaderHubSlug) and is collision-free by construction —
 * the suffix loop stays as a belt-and-suspenders guard only.
 */
import type postgres from "postgres";

import { GAME_ID } from "../../src/db/seed-data";
import { cardSlug, leaderHubSlug } from "../../src/lib/cards/normalize";

export async function assignLeaderSlugs(sql: postgres.Sql): Promise<number> {
  const pending = await sql<{ id: string; name: string }[]>`
    SELECT id::text, name FROM card_identities
    WHERE game_id = ${GAME_ID.mtg} AND is_leader_candidate
      AND slug IS NULL AND NOT is_removed
    ORDER BY popularity ASC NULLS LAST, name ASC`;
  if (pending.length === 0) return 0;

  const taken = new Set(
    (
      await sql<{ slug: string }[]>`
        SELECT slug FROM card_identities
        WHERE game_id = ${GAME_ID.mtg} AND slug IS NOT NULL`
    ).map((r) => r.slug),
  );

  const ids: string[] = [];
  const slugs: string[] = [];
  for (const { id, name } of pending) {
    const base = cardSlug(name);
    if (!base) continue; // nothing slug-worthy in the name; leave NULL
    let candidate = base;
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
    taken.add(candidate);
    ids.push(id);
    slugs.push(candidate);
  }
  if (ids.length === 0) return 0;

  await sql`
    UPDATE card_identities ci SET slug = v.slug
    FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${slugs}::text[]) AS slug) v
    WHERE ci.id = v.id`;
  return ids.length;
}

/**
 * OP leader slugs (P4.4): same append-only contract as the MTG pass (NULL-only
 * fill, never rewrite), but the slug shape is leaderHubSlug(name, external_key)
 * because OP names are not unique per leader. external_key order makes reruns
 * deterministic; collisions are structurally impossible within the game
 * namespace (ci_slug is unique per game and the key is unique per game).
 */
export async function assignOpLeaderSlugs(sql: postgres.Sql): Promise<number> {
  const pending = await sql<{ id: string; name: string; externalKey: string }[]>`
    SELECT id::text, name, external_key AS "externalKey" FROM card_identities
    WHERE game_id = ${GAME_ID.optcg} AND is_leader_candidate
      AND slug IS NULL AND NOT is_removed
    ORDER BY external_key ASC`;
  if (pending.length === 0) return 0;

  const taken = new Set(
    (
      await sql<{ slug: string }[]>`
        SELECT slug FROM card_identities
        WHERE game_id = ${GAME_ID.optcg} AND slug IS NOT NULL`
    ).map((r) => r.slug),
  );

  const ids: string[] = [];
  const slugs: string[] = [];
  for (const { id, name, externalKey } of pending) {
    const base = leaderHubSlug(name, externalKey);
    if (!base) continue; // nothing slug-worthy; leave NULL
    let candidate = base;
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
    taken.add(candidate);
    ids.push(id);
    slugs.push(candidate);
  }
  if (ids.length === 0) return 0;

  await sql`
    UPDATE card_identities ci SET slug = v.slug
    FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${slugs}::text[]) AS slug) v
    WHERE ci.id = v.id`;
  return ids.length;
}

// Standalone backfill entry point.
if (process.argv[1]?.endsWith("assign-leader-slugs.ts")) {
  void (async () => {
    const { config: loadEnv } = await import("dotenv");
    loadEnv({ path: [".env.local", ".env"], quiet: true });
    const { default: postgresClient } = await import("postgres");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    const sql = postgresClient(url, { max: 1, prepare: false });
    try {
      const n = await assignLeaderSlugs(sql);
      const nOp = await assignOpLeaderSlugs(sql);
      console.log(`assigned ${n} MTG + ${nOp} OP leader slug(s)`);
    } finally {
      await sql.end();
    }
  })();
}
