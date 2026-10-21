/**
 * The host guard every `BASE_URL`-taking script imports FIRST (S9,
 * SECURITY-AUDIT-report.md L19): it runs when the module is evaluated —
 * before the script's own body, so before `dotenv` reads `.env.local` and
 * before any `fetch` — and a non-local target ends the process with one
 * sentence on stderr and exit code 1 unless `SMOKE_ALLOW_REMOTE=1` is set
 * for that one run. The decision is `src/lib/smoke/host-guard.ts` (tested);
 * this file reads the environment and acts on the answer.
 *
 * The scripts build their URLs on the exported `BASE` rather than reading
 * `process.env.BASE_URL` again after their env load: the value the guard
 * checked is the value they use, so a `BASE_URL` line in `.env.local` can
 * never slip past it (dotenv fills an unset variable after this ran).
 */
import { checkSmokeTarget } from "../../src/lib/smoke/host-guard";

const target = checkSmokeTarget(process.env.BASE_URL, process.env.SMOKE_ALLOW_REMOTE);

if (!target.ok) {
  console.error(target.message);
  process.exit(1);
}

if (target.remote) {
  console.error(`smoke: remote target ${target.base} — SMOKE_ALLOW_REMOTE=1 is set for this run`);
}

/** The guarded base URL: `BASE_URL` as given (default http://localhost:3000), one trailing slash stripped. */
export const BASE: string = target.base;
