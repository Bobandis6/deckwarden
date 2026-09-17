/**
 * Dev-loopback rate-counter reset (LATER "Deferred infrastructure" row,
 * spec'd 2026-09-17): lets a session's full smoke battery run back-to-back
 * instead of choreographing 10/h windows. Deletes ONLY the loopback
 * `deck-create:*:::1` rows — the exact deletion `smoke:seo` performs at its
 * start — and nothing else: the pattern is a literal by construction, the
 * script takes no arguments, and the limiter itself stays untouched (it
 * still brakes a runaway dev loop between resets; prod limits are not up
 * for tuning until a real user trips a 429 — the cold-start rule).
 *
 *   pnpm counters:reset
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

// Refuse any argument: there is deliberately no way to widen the pattern.
if (process.argv.length > 2) {
  console.error("counters:reset takes no arguments — it only ever deletes deck-create:%:::1");
  process.exit(1);
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });
  try {
    const deleted = await sql<{ key: string; window_start: Date; count: number }[]>`
      DELETE FROM rate_limit_counters
      WHERE key LIKE ${"deck-create:%:::1"}
      RETURNING key, window_start, count`;
    for (const row of deleted) {
      console.log(
        `deleted ${row.key} (window ${row.window_start.toISOString()}, count ${row.count})`,
      );
    }
    console.log(`${deleted.length} loopback deck-create counter row(s) removed`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
