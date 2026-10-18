// @vitest-environment node
/**
 * GET /api/health (S1, SECURITY-AUDIT-report.md L3): the two public shapes,
 * `{ ok: true, db: "up" }` and `{ ok: false, db: "down", error }` with a
 * fixed message — the driver's error text, the database size and the price
 * age never leave the server. Real drizzle over a fake postgres.js client
 * that records the statement and answers or throws.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

let statements: string[] = [];
let failure: Error | null = null;

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string) {
    statements.push(sql);
    if (failure) throw failure;
    return { values: async () => [[1]], then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const { GET } = await import("./route");

const DRIVER_TEXT =
  'connect ECONNREFUSED ep-xxx-pooler.us-east-1.aws.neon.tech:5432 (database "neondb", user "deckwarden")';

beforeEach(() => {
  statements = [];
  failure = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("database up: 200 and exactly { ok: true, db: 'up' } after one `select 1`", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "up" });
    expect(statements).toEqual(["select 1"]);
  });

  it("database down: 503, { ok: false, db: 'down' } and a fixed message — no driver text", async () => {
    failure = new Error(DRIVER_TEXT);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, db: "down", error: "database unreachable" });
    expect(JSON.stringify(body)).not.toContain("neon");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    // The diagnostic goes to the server log, which is private: drizzle wraps
    // the driver's error (DrizzleQueryError, the original as its cause).
    expect(console.error).toHaveBeenCalledTimes(1);
    const [label, logged] = vi.mocked(console.error).mock.calls[0] as [
      string,
      Error & { cause?: unknown },
    ];
    expect(label).toBe("[health] database check failed");
    expect(logged.cause ?? logged).toBe(failure);
  });

  it("reads no gauge: no database size, price age or table count in the statement or the body", async () => {
    const res = await GET();
    const text = JSON.stringify(await res.json());
    for (const gauge of ["db_size_mb", "price_age_hours", "prices_fresh", "size_alert", "games"]) {
      expect(text).not.toContain(gauge);
    }
    expect(statements.join("\n")).not.toMatch(/pg_database_size|price_updated_at|from games/);
  });

  it("is dynamic (never cached)", async () => {
    const route = await import("./route");
    expect(route.dynamic).toBe("force-dynamic");
  });
});
