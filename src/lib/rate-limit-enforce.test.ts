// @vitest-environment node
/**
 * enforceRateLimit over the counters table (S4, SECURITY-AUDIT-report.md
 * M6's "the limiter counts"): the real upsert through the real drizzle
 * builders over an in-memory counters table (src/test/rate-limit-table.ts),
 * with the search bucket's numbers — 120 answers from one address, the
 * 121st a 429 carrying Retry-After and no-store, another address untouched,
 * every bucket of a policy counted on every call (a blocked request still
 * counts), and a database failure failing OPEN, as the module promises.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { createRateLimitTable } from "@/test/rate-limit-table";

const counters = createRateLimitTable();
const client = { throwOnce: false };
const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[]) {
    if (client.throwOnce) {
      client.throwOnce = false;
      throw new Error("connection refused");
    }
    if (!counters.handles(sql)) throw new Error(`unexpected statement: ${sql}`);
    const rows = counters.answer(params);
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const { enforceRateLimit, RATE_LIMITS } = await import("./rate-limit");

beforeEach(() => {
  counters.reset();
  client.throwOnce = false;
  vi.restoreAllMocks();
});

describe("enforceRateLimit over the counters table", () => {
  it("the search bucket: 120 answers from one address, the 121st is a 429 with Retry-After", async () => {
    const limits = RATE_LIMITS.cardSearch("203.0.113.9");
    for (let i = 0; i < 120; i++) expect(await enforceRateLimit(limits)).toBeNull();
    const res = await enforceRateLimit(limits);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(res?.headers.get("cache-control")).toBe("no-store");
    expect(await res?.json()).toEqual({ error: "Too many requests. Try again shortly." });
    // Both of the policy's buckets counted every call, the blocked one included.
    expect(counters.count("card-search:ip:203.0.113.9")).toBe(121);
    expect(counters.count("card-search:ip-hour:203.0.113.9")).toBe(121);
  });

  it("another address has its own rows and is untouched by the first's lockout", async () => {
    counters.seed("card-search:ip:203.0.113.9", 500, 60);
    expect((await enforceRateLimit(RATE_LIMITS.cardSearch("203.0.113.9")))?.status).toBe(429);
    expect(await enforceRateLimit(RATE_LIMITS.cardSearch("198.51.100.7"))).toBeNull();
    expect(counters.keys()).toEqual([
      "card-search:ip-hour:198.51.100.7",
      "card-search:ip-hour:203.0.113.9",
      "card-search:ip:198.51.100.7",
      "card-search:ip:203.0.113.9",
    ]);
  });

  it("the hourly lid blocks on its own once the minute bucket is fine", async () => {
    counters.seed("card-search:ip-hour:203.0.113.9", 2000, 3600);
    expect((await enforceRateLimit(RATE_LIMITS.cardSearch("203.0.113.9")))?.status).toBe(429);
  });

  it("fails OPEN when the counter upsert throws — a broken limiter never blocks a save", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    client.throwOnce = true;
    expect(await enforceRateLimit(RATE_LIMITS.cardSearch("203.0.113.9"))).toBeNull();
    expect(error).toHaveBeenCalledWith("rate limit check failed open:", expect.any(Error));
  });
});
