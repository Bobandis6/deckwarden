/**
 * @vitest-environment node
 *
 * The production instance's options (S3): what src/lib/auth.ts hands Better
 * Auth, read back from `auth.options` with the env stubbed and the database
 * client mocked — nothing connects, the adapter keeps the client until the
 * first query. Each piece's behaviour is pinned next to its own module
 * (verified-email, limiter-rules, session-payload, user-fields,
 * account-options, auth-disabled-paths); this pins that the production
 * instance carries all of them, which no throwaway instance can.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

for (const [name, value] of Object.entries({
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
  DISCORD_CLIENT_ID: "discord-client",
  DISCORD_CLIENT_SECRET: "discord-secret",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
})) {
  vi.stubEnv(name, value);
}

const fakeDb = drizzle(
  {
    options: { parsers: {}, serializers: {} },
    unsafe() {
      throw new Error("no database in this test");
    },
  } as never,
  { schema },
);

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const { auth } = await import("@/lib/auth");
const { ACCOUNT_HOOKS, ACCOUNT_OPTIONS } = await import("@/lib/auth/account-options");
const { AUTH_RATE_LIMIT_RULES } = await import("@/lib/auth/limiter-rules");
const { SESSION_PAYLOAD_HOOKS } = await import("@/lib/auth/session-payload");
const { narrowSignInRefresh, USER_ADDITIONAL_FIELDS } = await import("@/lib/auth/user-fields");
const { refuseUnverifiedUserInsert } = await import("@/lib/auth/verified-email");
const { AUTH_DISABLED_PATHS } = await import("@/lib/auth-disabled-paths");
const { betterAuthRateLimitStorage } = await import("@/lib/rate-limit");

const options = auth.options;

describe("the production Better Auth instance (S3)", () => {
  it("refuses unverified user inserts and narrows the sign-in refresh (M4, X5)", () => {
    expect(options.databaseHooks?.user?.create?.before).toBe(refuseUnverifiedUserInsert);
    expect(options.databaseHooks?.user?.update?.before).toBe(narrowSignInRefresh);
  });

  it("keeps the id token out of the account rows (LATER row 278)", () => {
    expect(options.databaseHooks?.account).toBe(ACCOUNT_HOOKS);
  });

  it("requires a verified email on both providers, beside the picture refresh (M4, X5)", () => {
    for (const provider of ["discord", "google"] as const) {
      expect(options.socialProviders?.[provider]).toMatchObject({
        requireEmailVerification: true,
        overrideUserInfoOnSignIn: true,
      });
    }
  });

  it("lands a failed callback on /account (M4, the silent redirect)", () => {
    expect(options.onAPIError).toEqual({ errorURL: "/account" });
  });

  it("exempts /get-session from the limiter and keeps the house counters (L21)", () => {
    expect(options.rateLimit?.enabled).toBe(true);
    expect(options.rateLimit?.customRules).toBe(AUTH_RATE_LIMIT_RULES);
    expect(options.rateLimit?.customStorage).toBe(betterAuthRateLimitStorage);
  });

  it("strips the session payload through the after hook (L9)", () => {
    expect(options.hooks?.after).toBe(SESSION_PAYLOAD_HOOKS.after);
    expect(Object.keys(options.hooks ?? {})).toEqual(["after"]);
  });

  it("keeps the earlier packages' settings (S2 L8, X1, X5)", () => {
    expect(options.account).toBe(ACCOUNT_OPTIONS);
    expect(options.disabledPaths).toBe(AUTH_DISABLED_PATHS);
    expect(options.user?.additionalFields).toBe(USER_ADDITIONAL_FIELDS);
    expect(options.session?.cookieCache).toEqual({ enabled: true, maxAge: 300 });
  });
});

describe("the browser client (L21)", () => {
  it("does not refetch the session on window focus", () => {
    const source = readFileSync(new URL("./auth-client.ts", import.meta.url), "utf8");
    expect(source).toContain("sessionOptions: { refetchOnWindowFocus: false }");
  });
});
