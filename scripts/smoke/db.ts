/**
 * The database guard every script that opens `DATABASE_URL` calls right
 * after its env load and before its first query (LATER row 295, the database
 * half of S9's L19, SECURITY-AUDIT-report.md): a `DATABASE_URL` whose Neon
 * host carries the production endpoint id named by `PRODUCTION_DB_ENDPOINT`
 * ends the process with one sentence on stderr and exit code 1, unless
 * `SMOKE_ALLOW_REMOTE=1` is set for that one run. The decision is
 * `src/lib/smoke/db-guard.ts` (tested); this file reads the environment and
 * acts on the answer.
 *
 * Unlike `./guard` (the host guard, a side effect of its import, which runs
 * before `loadEnv()` fills `.env.local` in), this is a FUNCTION: `DATABASE_URL`
 * and `PRODUCTION_DB_ENDPOINT` come from `.env.local`, so the check can only
 * run after the script's `loadEnv`. Nothing is read at module level. A
 * passing check prints nothing; the two informational lines — the check is
 * off because the variable is unset, or the opt-in let production through —
 * print once per process, so the second call `scripts/smoke/session.ts`
 * makes before its inserts is silent.
 *
 * The nightly's scripts (`db:size`, `decks:purge`, `backups:prune`,
 * `ruleset:watch`, `optcg:image-manifest`, `ingest:*`) run against production
 * by design and never set the variable; they do not call this.
 */
import {
  checkSmokeDatabase,
  PRODUCTION_ENDPOINT_VAR,
  REMOTE_OPT_IN,
} from "../../src/lib/smoke/db-guard";

let announced = false;

/** Refuse a production `DATABASE_URL` before the first query; call it right after `loadEnv`. */
export function guardDatabaseUrl(): void {
  const verdict = checkSmokeDatabase(
    process.env.DATABASE_URL,
    process.env.PRODUCTION_DB_ENDPOINT,
    process.env.SMOKE_ALLOW_REMOTE,
  );

  if (!verdict.ok) {
    console.error(verdict.message);
    process.exit(1);
  }

  if (announced) return;
  announced = true;

  if (!verdict.checked) {
    console.error(
      `smoke: ${PRODUCTION_ENDPOINT_VAR} is not set, so the database guard is off for this run — .env.example says what .env.local carries`,
    );
  } else if (verdict.production) {
    console.error(
      `smoke: DATABASE_URL names the production endpoint ${verdict.endpoint} — ${REMOTE_OPT_IN}=1 is set for this run`,
    );
  }
}
