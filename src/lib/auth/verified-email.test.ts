/**
 * @vitest-environment node
 *
 * The verified-email gate (S3, SECURITY-AUDIT-report.md M4) against Better
 * Auth itself: throwaway instances on the memory adapter, the provider's
 * calls answered by the shared harness. The control instance carries only
 * the library's own `requireEmailVerification` and reproduces the finding —
 * the squatter's row is written, only the session is withheld, and the real
 * owner's verified sign-in is refused forever. The S3 instance carries both
 * locks and the /account landing:
 *
 *  - an unverified profile leaves no row and lands on /account with the code;
 *  - a verified profile signs up and in;
 *  - the owner is never locked out: a verified sign-in from the other
 *    provider links to the verified row;
 *  - an unverified sign-in against an existing account is refused and
 *    writes nothing;
 *  - a row from before the gate (unverified, seeded past the hook) cannot
 *    sign in unverified and heals at its first verified sign-in;
 *  - the hook itself, alone and through the internal adapter.
 */
import { betterAuth } from "better-auth";
import { describe, expect, it } from "vitest";

import {
  BASE,
  landedError,
  setsSessionCookie,
  socialSignIn,
  type DiscordProfile,
  type GoogleProfile,
} from "@/test/oauth-harness";

import { narrowSignInRefresh, SIGN_IN_REFRESH } from "./user-fields";
import {
  EMAIL_NOT_VERIFIED,
  OAUTH_ERROR_LANDING,
  refuseUnverifiedUserInsert,
  REQUIRE_VERIFIED_EMAIL,
} from "./verified-email";

const EMAIL = "victim@smoke.invalid";
const DISCORD_ID = "100000000000000001";

const discord = (verified: boolean, email = EMAIL): DiscordProfile => ({
  id: DISCORD_ID,
  name: "Squatter",
  email,
  verified,
});
const google = (verified: boolean, email = EMAIL): GoogleProfile => ({
  sub: "google-sub-1",
  name: "Victim",
  email,
  email_verified: verified,
  picture: "https://lh3.googleusercontent.com/a/victim",
});

type Locks = { insertHook: boolean; providerCheck: boolean; landing: boolean };
const S3: Locks = { insertHook: true, providerCheck: true, landing: true };
const CONTROL: Locks = { insertHook: false, providerCheck: true, landing: false };

function instance(locks: Locks) {
  const provider = { ...SIGN_IN_REFRESH, ...(locks.providerCheck ? REQUIRE_VERIFIED_EMAIL : {}) };
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    socialProviders: {
      discord: { clientId: "test-client", clientSecret: "test-client-secret", ...provider },
      google: { clientId: "test-client", clientSecret: "test-client-secret", ...provider },
    },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    databaseHooks: {
      user: {
        ...(locks.insertHook ? { create: { before: refuseUnverifiedUserInsert } } : {}),
        update: { before: narrowSignInRefresh },
      },
    },
    ...(locks.landing ? { onAPIError: OAUTH_ERROR_LANDING } : {}),
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  });
}
type Auth = ReturnType<typeof instance>;

async function rows(auth: Auth, model: "user" | "account" | "session") {
  const ctx = await auth.$context;
  return ctx.adapter.findMany<Record<string, unknown>>({ model });
}

describe("control: the library's requireEmailVerification alone (the finding)", () => {
  it("writes the squatter's row, withholds only the session, and locks the owner out", async () => {
    const auth = instance(CONTROL);

    const squat = await socialSignIn(auth, "discord", discord(false));
    expect(squat.status).toBe(302);
    expect(landedError(squat)).toEqual({ landing: "/api/auth/error", code: EMAIL_NOT_VERIFIED });
    expect(setsSessionCookie(squat)).toBe(false);
    const users = await rows(auth, "user");
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: EMAIL, emailVerified: false });
    expect(await rows(auth, "account")).toHaveLength(1);

    // The real owner, verified at Google: refused to link to the unverified
    // row — and there is no other way in. Nothing new is written.
    const owner = await socialSignIn(auth, "google", google(true));
    expect(landedError(owner).code).toBe("account_not_linked");
    expect(setsSessionCookie(owner)).toBe(false);
    expect(await rows(auth, "user")).toHaveLength(1);
    expect(await rows(auth, "account")).toHaveLength(1);
  });
});

describe("S3: both locks and the /account landing", () => {
  it("an unverified profile leaves no row and lands on /account with the code", async () => {
    const auth = instance(S3);
    const res = await socialSignIn(auth, "discord", discord(false));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/account\?error=email_not_verified/);
    expect(landedError(res)).toEqual({ landing: "/account", code: EMAIL_NOT_VERIFIED });
    expect(setsSessionCookie(res)).toBe(false);
    expect(await rows(auth, "user")).toEqual([]);
    expect(await rows(auth, "account")).toEqual([]);
    expect(await rows(auth, "session")).toEqual([]);
  });

  it("a verified profile signs up and in", async () => {
    const auth = instance(S3);
    const res = await socialSignIn(auth, "discord", discord(true));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/account");
    expect(setsSessionCookie(res)).toBe(true);
    const users = await rows(auth, "user");
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: EMAIL, emailVerified: true });
  });

  it("the owner is never locked out: a verified Google sign-in links to the verified Discord row", async () => {
    const auth = instance(S3);
    expect(setsSessionCookie(await socialSignIn(auth, "discord", discord(true)))).toBe(true);

    const linked = await socialSignIn(auth, "google", google(true));
    expect(linked.headers.get("location")).toBe("/account");
    expect(setsSessionCookie(linked)).toBe(true);
    expect(await rows(auth, "user")).toHaveLength(1);
    const accounts = await rows(auth, "account");
    expect(accounts.map((a) => a.providerId).sort()).toEqual(["discord", "google"]);
    expect(new Set(accounts.map((a) => a.userId)).size).toBe(1);
  });

  it("an unverified sign-in against an existing account is refused and writes nothing", async () => {
    const auth = instance(S3);
    expect(setsSessionCookie(await socialSignIn(auth, "google", google(true)))).toBe(true);

    const squat = await socialSignIn(auth, "discord", discord(false));
    expect(landedError(squat)).toEqual({ landing: "/account", code: "account_not_linked" });
    expect(setsSessionCookie(squat)).toBe(false);
    expect(await rows(auth, "user")).toHaveLength(1);
    expect((await rows(auth, "account")).map((a) => a.providerId)).toEqual(["google"]);
  });

  it("a row from before the gate cannot sign in unverified, and heals at its first verified sign-in", async () => {
    const auth = instance(S3);
    const ctx = await auth.$context;
    // Seeded past the hooks, the way the rows that predate S3 exist.
    const now = new Date();
    const legacy = await ctx.adapter.create<Record<string, unknown>>({
      model: "user",
      data: { name: "Legacy", email: EMAIL, emailVerified: false, createdAt: now, updatedAt: now },
    });
    await ctx.adapter.create({
      model: "account",
      data: {
        userId: legacy.id,
        providerId: "discord",
        accountId: DISCORD_ID,
        createdAt: now,
        updatedAt: now,
      },
    });

    const unverified = await socialSignIn(auth, "discord", discord(false));
    expect(landedError(unverified)).toEqual({ landing: "/account", code: EMAIL_NOT_VERIFIED });
    expect(setsSessionCookie(unverified)).toBe(false);
    expect(await rows(auth, "session")).toEqual([]);

    const verified = await socialSignIn(auth, "discord", discord(true));
    expect(verified.headers.get("location")).toBe("/account");
    expect(setsSessionCookie(verified)).toBe(true);
    const users = await rows(auth, "user");
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ id: legacy.id, emailVerified: true });
  });
});

describe("the hook itself", () => {
  const user = (emailVerified: unknown) =>
    ({ name: "x", email: "x@smoke.invalid", emailVerified }) as Parameters<
      typeof refuseUnverifiedUserInsert
    >[0];

  it("refuses an unverified or unknown flag with the callback's code, passes a verified one", async () => {
    await expect(refuseUnverifiedUserInsert(user(false), null)).rejects.toMatchObject({
      body: { code: EMAIL_NOT_VERIFIED },
    });
    await expect(refuseUnverifiedUserInsert(user(undefined), null)).rejects.toMatchObject({
      body: { code: EMAIL_NOT_VERIFIED },
    });
    await expect(refuseUnverifiedUserInsert(user("true"), null)).rejects.toMatchObject({
      body: { code: EMAIL_NOT_VERIFIED },
    });
    await expect(refuseUnverifiedUserInsert(user(true), null)).resolves.toBeUndefined();
  });

  it("guards the internal adapter's create on any path, not just the OAuth callback", async () => {
    const auth = instance(S3);
    const ctx = await auth.$context;
    await expect(
      ctx.internalAdapter.createUser(
        { name: "Direct", email: "direct@smoke.invalid", emailVerified: false },
        { method: "oauth", oauth: { providerId: "discord" } },
      ),
    ).rejects.toMatchObject({ body: { code: EMAIL_NOT_VERIFIED } });
    expect(await rows(auth, "user")).toEqual([]);
    await ctx.internalAdapter.createUser(
      { name: "Direct", email: "direct@smoke.invalid", emailVerified: true },
      { method: "oauth", oauth: { providerId: "discord" } },
    );
    expect(await rows(auth, "user")).toHaveLength(1);
  });

  it("the second lock and the landing are the values auth.ts spreads in", () => {
    expect(REQUIRE_VERIFIED_EMAIL).toEqual({ requireEmailVerification: true });
    expect(OAUTH_ERROR_LANDING).toEqual({ errorURL: "/account" });
    expect(EMAIL_NOT_VERIFIED).toBe("email_not_verified");
  });
});
