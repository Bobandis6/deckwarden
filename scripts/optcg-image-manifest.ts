/**
 * Writes .optcg-images/manifest.tsv — `<printing key>\t<Bandai source URL>`
 * per non-removed OP printing — for mirror-optcg-images.sh to consume.
 *
 * Deliberately DB-derived (not an ingest side effect): the mirror step then
 * self-heals every night regardless of whether the ingest ran or skipped —
 * an interrupted backfill just resumes on the next run.
 *
 * The source URL for the download is always the Bandai URL. When the ingest
 * ran with R2_PUBLIC_IMAGE_BASE set, image_override already points at R2, so
 * the Bandai URL is re-derived from the printing key (the documented pattern:
 * en.onepiece-cardgame.com/images/cardlist/card/<KEY>.png).
 *
 * Run: pnpm optcg:image-manifest
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { mkdirSync, writeFileSync } from "node:fs";

import postgres from "postgres";

import { GAME_ID } from "../src/db/seed-data";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const rows = await sql<{ key: string; front: string | null }[]>`
      SELECT collector_number AS key, image_override->>'front' AS front
      FROM card_printings
      WHERE game_id = ${GAME_ID.optcg} AND NOT is_removed
      ORDER BY collector_number`;
    const lines = rows.map((r) => {
      const src =
        r.front?.startsWith("https://en.onepiece-cardgame.com/") === true
          ? r.front
          : `https://en.onepiece-cardgame.com/images/cardlist/card/${r.key}.png`;
      return `${r.key}\t${src}`;
    });
    mkdirSync(".optcg-images", { recursive: true });
    writeFileSync(".optcg-images/manifest.tsv", lines.join("\n") + (lines.length ? "\n" : ""));
    console.log(`wrote .optcg-images/manifest.tsv (${lines.length} printings)`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
