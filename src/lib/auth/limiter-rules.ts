/**
 * Better Auth's per-path limiter rules (S3, SECURITY-AUDIT-report.md L21).
 * Its own module so a throwaway instance can carry the same rules
 * (limiter-rules.test.ts): src/lib/auth.ts needs env and a database at load.
 *
 * The limiter runs on every HTTP request under /api/auth, through the house
 * Postgres counters (rate-limit.ts, `customStorage`) — one upsert per
 * request. The site header mounts `useSession()` on every page, which GETs
 * `/get-session` on mount (and on every window focus, until auth-client.ts
 * turned that off), so every page view by every visitor, signed in or not,
 * was a counter write: the cookie cache saved the session READ and the
 * limiter spent a WRITE in its place. `false` for a path makes
 * `resolveRateLimitConfig` return null before any storage call
 * (`dist/api/rate-limiter/index.mjs`: `if (resolved === false) return null`);
 * the stock 3-per-10-seconds rule on /sign-in/* and the 100-per-10-seconds
 * default elsewhere stay. The route answers from the cookie alone, so a
 * flood of it reaches nothing but the function invocation itself.
 */
import type { BetterAuthOptions } from "better-auth";

export const AUTH_RATE_LIMIT_RULES = {
  "/get-session": false,
} as const satisfies NonNullable<NonNullable<BetterAuthOptions["rateLimit"]>["customRules"]>;
