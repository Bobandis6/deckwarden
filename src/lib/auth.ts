/**
 * Better Auth server instance (P2.1). Discord + Google only — no email stack
 * exists in v1 at all (build plan §2): no passwords, no reset flow, no
 * verification sender. The tables live in our Postgres via the Drizzle
 * adapter (schema.ts "Auth" section), so the claim flow can share the
 * database and a pg_dump/restore carries auth with it (portability rules).
 *
 * Ids are uuids (generateId: "uuid") because decks.user_id is a uuid FK —
 * in that mode the pg adapter omits ids on insert and the tables' DB-side
 * gen_random_uuid() defaults fill them. Env is read via requireEnv so a
 * misconfigured deploy fails at build with the variable's name instead of a
 * 500 at first sign-in.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDb, schema } from "@/db";
import { ACCOUNT_HOOKS, ACCOUNT_OPTIONS } from "@/lib/auth/account-options";
import { AUTH_RATE_LIMIT_RULES } from "@/lib/auth/limiter-rules";
import { SESSION_PAYLOAD_HOOKS } from "@/lib/auth/session-payload";
import {
  narrowSignInRefresh,
  SIGN_IN_REFRESH,
  USER_ADDITIONAL_FIELDS,
} from "@/lib/auth/user-fields";
import {
  OAUTH_ERROR_LANDING,
  refuseUnverifiedUserInsert,
  REQUIRE_VERIFIED_EMAIL,
} from "@/lib/auth/verified-email";
import { AUTH_DISABLED_PATHS } from "@/lib/auth-disabled-paths";
import { betterAuthRateLimitStorage } from "@/lib/rate-limit";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see .env.example.`);
  return value;
}

/**
 * Canonical origin the OAuth redirect URIs are registered against. Preview
 * deploys intentionally get the production origin: their *.vercel.app hosts
 * aren't registered with Discord/Google, so sign-in only works on the real
 * site and on localhost.
 */
function baseURL(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  return process.env.NODE_ENV === "production" ? "https://deckwarden.gg" : "http://localhost:3000";
}

export const auth = betterAuth({
  baseURL: baseURL(),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    usePlural: true,
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
  }),
  // X5: every sign-in refreshes the provider picture (a stale Discord URL
  // heals by signing in again) — and ONLY the picture: the hook below drops
  // the name and the email from that write (user-fields.ts has the why).
  // S3 (SECURITY-AUDIT-report.md M4): requireEmailVerification is the second
  // lock on an unverified provider email — the first is the user-create hook
  // below; verified-email.ts has why neither is enough alone.
  socialProviders: {
    discord: {
      clientId: requireEnv("DISCORD_CLIENT_ID"),
      clientSecret: requireEnv("DISCORD_CLIENT_SECRET"),
      ...SIGN_IN_REFRESH,
      ...REQUIRE_VERIFIED_EMAIL,
    },
    google: {
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      ...SIGN_IN_REFRESH,
      ...REQUIRE_VERIFIED_EMAIL,
    },
  },
  // S2 (SECURITY-AUDIT-report.md L8): the provider tokens at rest are
  // encrypted under the secret; account-options.ts has the legacy-row reading.
  account: ACCOUNT_OPTIONS,
  // The chosen picture and the username ride in the session (the header
  // reads both with no server read); no client can write either.
  user: { additionalFields: USER_ADDITIONAL_FIELDS },
  // The user create hook refuses a `users` row without a verified email (S3,
  // M4); the update hook narrows the sign-in refresh to the picture (X5). The
  // account pair keeps the provider's id token out of `accounts` (S3, LATER
  // row 278 — account-options.ts).
  databaseHooks: {
    user: {
      create: { before: refuseUnverifiedUserInsert },
      update: { before: narrowSignInRefresh },
    },
    account: ACCOUNT_HOOKS,
  },
  // S3: a failed OAuth callback lands on /account, which explains the code in
  // one sentence (sign-in-error.ts) — not on Better Auth's own error page.
  onAPIError: OAUTH_ERROR_LANDING,
  // S3 (SECURITY-AUDIT-report.md L9): /get-session and /list-sessions answer
  // without the session token, IP address and user agent.
  hooks: SESSION_PAYLOAD_HOOKS,
  session: {
    // Signed cookie cache: deck routes check the session without a DB read
    // for up to 5 minutes (Neon compute is a budget); sign-out revocation lag
    // is capped at the same 5 minutes.
    cookieCache: { enabled: true, maxAge: 300 },
  },
  rateLimit: {
    // Better-auth only enables this in production by default — forced on so
    // dev and previews exercise the same 429 paths. Rules stay stock (per
    // ip+path: 100/10s globally, 3/10s on /sign-in/*) with one exemption:
    // /get-session, which the site header fetches on every page view, is not
    // counted at all (S3, SECURITY-AUDIT-report.md L21 — limiter-rules.ts);
    // the storage is the house Postgres counters (rate-limit.ts) so limits
    // actually hold across serverless instances.
    enabled: true,
    customStorage: betterAuthRateLimitStorage,
    customRules: AUTH_RATE_LIMIT_RULES,
  },
  // Stock routes the app never calls and must not expose (the unvalidated
  // profile write) — the list and its reasons live in auth-disabled-paths.ts.
  disabledPaths: AUTH_DISABLED_PATHS,
  advanced: { database: { generateId: "uuid" } },
  telemetry: { enabled: false },
  // Per better-auth docs nextCookies stays last so Set-Cookie propagates from
  // server-side auth.api calls.
  plugins: [nextCookies()],
});

/**
 * Session user id for deck routes; null when signed out. `authoritative`
 * skips the 5-minute cookie cache for a database read of the session: the
 * destructive routes (account and deck DELETE) ask for it, so a session
 * revoked elsewhere cannot act within the cache window (S3; the report's §8
 * item on cookie-cache lag).
 */
export async function getSessionUserId(
  headers: Headers,
  opts: { authoritative?: boolean } = {},
): Promise<string | null> {
  const session = await auth.api.getSession({
    headers,
    ...(opts.authoritative ? { query: { disableCookieCache: true } } : {}),
  });
  return session?.user.id ?? null;
}
