/**
 * Free-tier fuel gauge: prints pg_database_size and FAILS (exit 1) above ~350MB —
 * a red nightly Action run is the alert channel (plan §9). pnpm db:size
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

const ALERT_MB = 350;

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });
  try {
    const [{ mb }] = await sql<
      { mb: number }[]
    >`SELECT (pg_database_size(current_database()) / 1048576.0)::float AS mb`;
    console.log(`database size: ${mb.toFixed(1)}MB (alert at ${ALERT_MB}MB, Neon free ~512MB)`);
    if (mb > ALERT_MB) {
      console.error(
        `ALERT: over the ${ALERT_MB}MB budget line — trim rows or execute the Neon exit runbook (LATER.md)`,
      );
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
