/**
 * The env load every script and CLI entry point runs before it reads its
 * variables (LATER row 293, the owner's call of 2026-10-23: the `dotenv`
 * package goes): `.env.local`, then `.env`, through Node 22's own parser
 * (`process.loadEnvFile`), with the precedence dotenv's
 * `config({ path: [".env.local", ".env"], quiet: true })` gave every caller.
 * A variable the environment already holds wins over both files —
 * `process.loadEnvFile` never overwrites one — so `.env.local`, loaded first,
 * wins over `.env` (the Next.js convention), and a missing file is skipped
 * without a word: the nightly has neither and takes its values from the
 * workflow's secrets.
 *
 * A call in the script's body, not `node --env-file`: the flag fills
 * `process.env` before the first import runs, and `scripts/smoke/guard.ts`
 * reads `BASE_URL` and `SMOKE_ALLOW_REMOTE` at import time so that a line in
 * `.env.local` can neither move a smoke's target nor turn the per-run opt-in
 * into a standing one. Scripts call this where they called dotenv: after the
 * guard's import, before `guardDatabaseUrl()` and the first query
 * (`src/lib/smoke/wiring.test.ts` pins the order).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Highest precedence first: a later file never overwrites what an earlier one set. */
export const ENV_FILES = [".env.local", ".env"] as const;

/** Load `.env.local`, then `.env`, from `dir` — the working directory, where pnpm runs every script. */
export function loadEnv(dir: string = process.cwd()): void {
  for (const file of ENV_FILES) {
    const path = join(dir, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
