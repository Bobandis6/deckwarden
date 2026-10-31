/**
 * @vitest-environment node
 *
 * The auth catch-all's path guard and the limiter's bounded key (the
 * 2026-10-30 security audit's counters-cardinality record), against the
 * installed Better Auth on throwaway instances — no database (its memory
 * adapter), none of the env src/lib/auth.ts needs — and against the REAL
 * `betterAuthRateLimitStorage` over the in-memory counters table, so what is
 * counted is what Postgres would hold. The pins: the mounted set is the
 * library's declaration with its two parametrised routes and no wildcard (an
 * upgrade that mounts one fails here, not in the guard); a fresh path is a 404
 * before the handler and mints no row; /callback/<fresh> ×N shares one key;
 * /get-session mints nothing; a real route counts under its own pattern; and
 * with the guard absent the storage still bounds an unknown path to one
 * shared bucket.
 */
import { betterAuth } from "better-auth";
import { toNextJsHandler } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { createRateLimitTable } from "@/test/rate-limit-table";

import { AUTH_RATE_LIMIT_RULES } from "./limiter-rules";
import {
  authRoutePath,
  boundAuthLimiterKey,
  guardAuthPaths,
  isSupportedAuthPattern,
  matchAuthPath,
  mountedAuthPathPatterns,
  UNKNOWN_AUTH_PATH,
} from "./known-paths";

const counters = createRateLimitTable();
const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[]) {
    if (!counters.handles(sql)) throw new Error(`unexpected statement: ${sql}`);
    return { values: async () => counters.answer(params), then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const { betterAuthRateLimitStorage, setAuthPathPatterns } = await import("@/lib/rate-limit");

const BASE = "http://localhost:3000";
const IP = "203.0.113.9";

function instance() {
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    socialProviders: { discord: { clientId: "test-client", clientSecret: "test-client-secret" } },
    rateLimit: {
      enabled: true,
      customStorage: betterAuthRateLimitStorage,
      customRules: AUTH_RATE_LIMIT_RULES,
    },
    telemetry: { enabled: false },
  });
}

const auth = instance();
const PATTERNS = mountedAuthPathPatterns(auth.api as Record<string, unknown>);
const get = (path: string) =>
  new Request(`${BASE}/api/auth${path}`, { headers: { "x-forwarded-for": IP } });

beforeEach(() => {
  counters.reset();
  setAuthPathPatterns(PATTERNS);
});

describe("the mounted set", () => {
  it("is the library's own: tens of literal paths and the two parametrised routes, no wildcard", () => {
    expect(PATTERNS.length).toBeGreaterThan(20);
    expect(PATTERNS).toEqual(
      expect.arrayContaining([
        "/callback/:id",
        "/reset-password/:token",
        "/sign-in/social",
        "/get-session",
        "/sign-out",
        "/ok",
      ]),
    );
    for (const pattern of PATTERNS) {
      expect(isSupportedAuthPattern(pattern), pattern).toBe(true);
    }
    expect(isSupportedAuthPattern("/files/**")).toBe(false);
    expect(isSupportedAuthPattern("/a/*")).toBe(false);
    expect(isSupportedAuthPattern("no-slash")).toBe(false);
  });

  it("matches a path to its pattern: literals by equality, :param to exactly one non-empty segment", () => {
    expect(matchAuthPath("/callback/discord", PATTERNS)).toBe("/callback/:id");
    expect(matchAuthPath("/callback/anything-at-all", PATTERNS)).toBe("/callback/:id");
    expect(matchAuthPath("/callback/", PATTERNS)).toBeNull();
    expect(matchAuthPath("/callback/a/b", PATTERNS)).toBeNull();
    expect(matchAuthPath("/sign-in/social", PATTERNS)).toBe("/sign-in/social");
    expect(matchAuthPath("/sign-in/SOCIAL", PATTERNS)).toBeNull();
    expect(matchAuthPath("/nope", PATTERNS)).toBeNull();
    expect(matchAuthPath("/", PATTERNS)).toBeNull();
  });

  it("reads the request path the way the library's limiter does: base path and trailing slashes off", () => {
    expect(authRoutePath("/api/auth/callback/discord/")).toBe("/callback/discord");
    expect(authRoutePath("/api/auth")).toBe("/");
    expect(authRoutePath("/api/auth/")).toBe("/");
    expect(authRoutePath("/api/auth/ok")).toBe("/ok");
  });

  it("bounds a library key to (patterns + 1) shapes per address and 64 characters of address", () => {
    expect(boundAuthLimiterKey(`${IP}|/callback/fresh-17`, PATTERNS)).toBe(
      `auth:${IP}|/callback/:id`,
    );
    expect(boundAuthLimiterKey(`${IP}|/sign-in/social`, PATTERNS)).toBe(
      `auth:${IP}|/sign-in/social`,
    );
    expect(boundAuthLimiterKey(`${IP}|/no/such/path`, PATTERNS)).toBe(
      `auth:${IP}|${UNKNOWN_AUTH_PATH}`,
    );
    expect(boundAuthLimiterKey(`${"9".repeat(100)}|/ok`, PATTERNS)).toBe(
      `auth:${"9".repeat(64)}|/ok`,
    );
    expect(boundAuthLimiterKey("no-separator", PATTERNS)).toBe(
      `auth:malformed|${UNKNOWN_AUTH_PATH}`,
    );
    // Until auth.ts hands the patterns over, every path is the bounded unknown bucket.
    expect(boundAuthLimiterKey(`${IP}|/callback/discord`, [])).toBe(
      `auth:${IP}|${UNKNOWN_AUTH_PATH}`,
    );
  });
});

describe("the guarded catch-all over the real storage", () => {
  const handlers = toNextJsHandler(auth);
  const GET = guardAuthPaths(handlers.GET, PATTERNS);

  it("50 fresh paths from one address: 50 bare 404s before the handler, and no counter row at all", async () => {
    for (let i = 0; i < 50; i++) {
      const res = await GET(get(`/fresh-path-${i}`));
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    }
    expect(counters.keys()).toEqual([]);
  });

  it("50 callbacks with fresh ids share ONE key, the pattern's, and the handler still answers them", async () => {
    const statuses = new Set<number>();
    for (let i = 0; i < 50; i++) statuses.add((await GET(get(`/callback/fresh-${i}`))).status);
    expect([...statuses].every((s) => s !== 404)).toBe(true);
    expect(counters.keys()).toEqual([`auth:${IP}|/callback/:id`]);
    expect(counters.count(`auth:${IP}|/callback/:id`)).toBe(50);
  });

  it("a real route counts under its own pattern; /get-session stays exempt; a nested or cased miss is a 404", async () => {
    expect((await GET(get("/ok"))).status).toBe(200);
    expect((await GET(get("/get-session"))).status).toBe(200);
    // A trailing slash passes the guard (the library's limiter strips it too) and the
    // library's own router answers the 404: the row it costs is the route's own key.
    expect((await GET(get("/ok/"))).status).toBe(404);
    expect((await GET(get("/OK"))).status).toBe(404);
    expect((await GET(get("/ok/more"))).status).toBe(404);
    expect(counters.keys()).toEqual([`auth:${IP}|/ok`]);
    expect(counters.count(`auth:${IP}|/ok`)).toBe(2);
  });

  it("the library's own disabledPaths and route 404s still apply behind the guard", async () => {
    const closed = betterAuth({
      baseURL: BASE,
      secret: "test-secret-test-secret-test-secret-0123",
      disabledPaths: ["/ok"],
      rateLimit: { enabled: true, customStorage: betterAuthRateLimitStorage },
      telemetry: { enabled: false },
    });
    const patterns = mountedAuthPathPatterns(closed.api as Record<string, unknown>);
    const guarded = guardAuthPaths(toNextJsHandler(closed).GET, patterns);
    expect((await guarded(get("/ok"))).status).toBe(404);
  });

  it("without the guard the storage alone still bounds an unknown-path flood to one shared bucket", async () => {
    for (let i = 0; i < 25; i++) expect((await handlers.GET(get(`/fresh-${i}`))).status).toBe(404);
    expect(counters.keys()).toEqual([`auth:${IP}|${UNKNOWN_AUTH_PATH}`]);
    expect(counters.count(`auth:${IP}|${UNKNOWN_AUTH_PATH}`)).toBe(25);
  });
});
