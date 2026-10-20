/**
 * An in-memory `rate_limit_counters` table for the fake postgres.js clients
 * the route tests run (S4, SECURITY-AUDIT-report.md M1/M6): it answers the
 * ONE statement src/lib/rate-limit.ts sends — the check-and-increment
 * upsert — the way Postgres would, so a test can run the REAL
 * `enforceRateLimit` through the real drizzle builders and then read what
 * was counted, per key. Rows are keyed by (key, window_start) like the
 * table's primary key; `windowStartFor` is the module's own, so a seeded
 * count lands in the window a request made now consumes.
 */
import { windowStartFor } from "@/lib/rate-limit";

export const RATE_LIMIT_UPSERT =
  'insert into "rate_limit_counters" ("key", "window_start", "count") values ($1, $2, $3) on conflict ("key","window_start") do update set "count" = "rate_limit_counters"."count" + 1 returning "count"';

export interface RateLimitTable {
  /** Whether a statement is the limiter's upsert. */
  handles(sql: string): boolean;
  /** Answers the upsert: the row's count after the increment, as the driver hands it back. */
  answer(params: unknown[]): unknown[][];
  /** A key's count, summed over its windows (a test runs inside one). */
  count(key: string): number;
  /** Every key with a row, sorted. */
  keys(): string[];
  /** Pre-fills a key's current window. */
  seed(key: string, count: number, windowSeconds: number): void;
  reset(): void;
}

export function createRateLimitTable(): RateLimitTable {
  const rows = new Map<string, number>();
  const rowKey = (key: string, windowStart: Date | string) =>
    `${key}|${new Date(windowStart).toISOString()}`;
  return {
    handles: (sql) => sql === RATE_LIMIT_UPSERT,
    answer(params) {
      const [key, windowStart] = params as [string, Date | string, number];
      const k = rowKey(key, windowStart);
      const next = (rows.get(k) ?? 0) + 1;
      rows.set(k, next);
      return [[next]];
    },
    count(key) {
      let n = 0;
      for (const [k, v] of rows) if (k.startsWith(`${key}|`)) n += v;
      return n;
    },
    keys() {
      return [...new Set([...rows.keys()].map((k) => k.slice(0, k.lastIndexOf("|"))))].sort();
    },
    seed(key, count, windowSeconds) {
      rows.set(rowKey(key, windowStartFor(Date.now(), windowSeconds)), count);
    },
    reset() {
      rows.clear();
    },
  };
}
