/**
 * The ruleset watch (Y3a, WAVE4 D3): FAILS (exit 1) when the Game Changers the
 * latest successful Scryfall run recorded stop matching the hash pinned in
 * src/lib/games/mtg/bracket-ruleset.ts — a red nightly is the alert channel,
 * like the DB gauge. The flags have already updated themselves; this step
 * exists so a rules change is read by a person. pnpm ruleset:watch
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

import { watchGameChangers } from "../src/lib/games/mtg/ruleset-watch";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });
  try {
    const [run] = await sql<{ id: number; started_at: Date; stats: unknown }[]>`
      SELECT id, started_at, stats FROM ingest_runs
      WHERE source = 'scryfall' AND status = 'succeeded'
      ORDER BY started_at DESC LIMIT 1`;
    const result = watchGameChangers(
      run
        ? { id: Number(run.id), startedAt: run.started_at.toISOString(), stats: run.stats }
        : null,
    );
    if (result.ok) console.log(result.message);
    else {
      console.error(result.message);
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
