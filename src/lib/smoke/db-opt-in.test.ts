// @vitest-environment node
/**
 * The database guard honours SMOKE_ALLOW_REMOTE from the run's own environment
 * alone (the 2026-10-30 security audit's opt-in record, LATER row 295): it
 * used to read the variable inside `guardDatabaseUrl()`, after the script's
 * `loadEnv()`, so a `SMOKE_ALLOW_REMOTE=1` line in `.env.local` satisfied it
 * exactly as a command-line value would and the per-run switch became a
 * standing one. Now `scripts/smoke/db.ts` captures the value when it is
 * evaluated — before any `loadEnv()`, since every caller imports it
 * statically — like the host guard. This runs the real module in the real
 * order over a temp `.env.local`: import, env load, guard.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadEnv } from "@/lib/load-env";

const VARS = ["DATABASE_URL", "PRODUCTION_DB_ENDPOINT", "SMOKE_ALLOW_REMOTE"] as const;
const PRODUCTION = "ep-dummy-prod-123456";
/** A dummy connection string on the production endpoint's pooled host — no real credential. */
const PRODUCTION_URL = `postgresql://u:p@${PRODUCTION}-pooler.us-east-1.aws.neon.tech/db`;

const saved: Partial<Record<(typeof VARS)[number], string | undefined>> = {};
let dir: string;
let exitCode: number | null;
let stderr: string[];

/** Import the guard fresh (the module-level capture runs again), as a script's static import does. */
async function importGuard() {
  vi.resetModules();
  const mod = await import("../../../scripts/smoke/db");
  return mod.guardDatabaseUrl;
}

beforeEach(() => {
  for (const v of VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
  dir = mkdtempSync(join(tmpdir(), "dw-db-opt-in-"));
  exitCode = null;
  stderr = [];
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`process.exit(${code})`);
  }) as never);
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    stderr.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("the database guard's per-run opt-in", () => {
  it("a SMOKE_ALLOW_REMOTE=1 line in .env.local does not lift the production refusal", async () => {
    const guard = await importGuard();
    writeFileSync(
      join(dir, ".env.local"),
      `DATABASE_URL="${PRODUCTION_URL}"\nPRODUCTION_DB_ENDPOINT="${PRODUCTION}"\nSMOKE_ALLOW_REMOTE=1\n`,
    );
    loadEnv(dir);
    // The file's line did reach the environment — after the capture, so it counts for nothing.
    expect(process.env.SMOKE_ALLOW_REMOTE).toBe("1");

    expect(() => guard()).toThrow("process.exit(1)");
    expect(exitCode).toBe(1);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain(`the production endpoint ${PRODUCTION}`);
    expect(stderr[0]).not.toContain(PRODUCTION_URL);
  });

  it("the same variable set in the shell before the import still lifts it, for that run", async () => {
    process.env.SMOKE_ALLOW_REMOTE = "1";
    const guard = await importGuard();
    writeFileSync(
      join(dir, ".env.local"),
      `DATABASE_URL="${PRODUCTION_URL}"\nPRODUCTION_DB_ENDPOINT="${PRODUCTION}"\n`,
    );
    loadEnv(dir);

    expect(() => guard()).not.toThrow();
    expect(exitCode).toBeNull();
    expect(stderr).toEqual([
      `smoke: DATABASE_URL names the production endpoint ${PRODUCTION} — SMOKE_ALLOW_REMOTE=1 is set for this run`,
    ]);
  });

  it("a development branch passes silently whatever the file says about the opt-in", async () => {
    const guard = await importGuard();
    writeFileSync(
      join(dir, ".env.local"),
      `DATABASE_URL="postgresql://u:p@ep-dummy-dev-654321-pooler.us-east-1.aws.neon.tech/db"\nPRODUCTION_DB_ENDPOINT="${PRODUCTION}"\nSMOKE_ALLOW_REMOTE=1\n`,
    );
    loadEnv(dir);
    expect(() => guard()).not.toThrow();
    expect(stderr).toEqual([]);
  });
});
