/**
 * Better Auth server instance (P2.1). Discord + Google only — no email stack
 * exists in v1 at all (build plan §2): no passwords, no reset flow, no
 * verification sender. The tables live in our Postgres via the Drizzle
 * adapter (schema.ts "Auth" section), so the claim flow can share the
 * database and a pg_dump/restore carries auth with it (portability rules).
 *
 * Ids are uuids (generateId: "uuid") because decks.user_id is a uuid FK.
 * Env is read via requireEnv so a misconfigured deploy fails at build with
 * the variable's name instead of a 500 at first sign-in.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDb, schema } from "@/db";

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
  socialProviders: {
    discord: {
      clientId: requireEnv("DISCORD_CLIENT_ID"),
      clientSecret: requireEnv("DISCORD_CLIENT_SECRET"),
    },
    google: {
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    },
  },
  session: {
    // Signed cookie cache: deck routes check the session without a DB read
    // for up to 5 minutes (Neon compute is a budget); sign-out revocation lag
    // is capped at the same 5 minutes.
    cookieCache: { enabled: true, maxAge: 300 },
  },
  advanced: { database: { generateId: "uuid" } },
  telemetry: { enabled: false },
  // Per better-auth docs nextCookies stays last so Set-Cookie propagates from
  // server-side auth.api calls.
  plugins: [nextCookies()],
});

/** Session user id for deck routes; null when signed out. */
export async function getSessionUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}
