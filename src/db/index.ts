/**
 * Database client. Plain postgres.js over TCP — no Neon/Vercel-proprietary driver,
 * so the same code runs on Vercel, a VPS, or against a local container.
 *
 * Serverless note: one connection per function instance is plenty; Neon's pooled
 * (`-pooler`) endpoint handles fan-out. Keep `max` small so cold starts stay cheap.
 *
 * `DB_LOG=1` (dev only) logs every statement — see createDb.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Put the Neon pooled connection string in .env.local (local) or the Vercel env vars (deploy).",
    );
  }
  return url;
}

export function createDb(url = databaseUrl()) {
  const client = postgres(url, {
    max: 1,
    prepare: false,
    // Dev-only statement log (R5a): `DB_LOG=1 pnpm dev` prints one line per
    // statement so a page's query budget is counted, not estimated. Unset
    // (every deploy) leaves `debug` undefined and postgres.js installs no hook.
    debug: process.env.DB_LOG
      ? (_connection, query) => console.log(`[db] ${query.replace(/\s+/g, " ").trim()}`)
      : undefined,
  });
  return { client, db: drizzle(client, { schema }) };
}

export type Db = ReturnType<typeof createDb>["db"];
/** The callback argument of db.transaction, for helpers that run inside a caller's transaction. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run queries: the singleton or an open transaction. */
export type DbExecutor = Db | Tx;

const globalForDb = globalThis as unknown as { __deckwardenDb?: Db };

/** Lazily-created singleton for the app (survives Next dev HMR). */
export function getDb(): Db {
  if (!globalForDb.__deckwardenDb) {
    globalForDb.__deckwardenDb = createDb().db;
  }
  return globalForDb.__deckwardenDb;
}

export { schema };
