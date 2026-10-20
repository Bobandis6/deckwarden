/**
 * @vitest-environment node
 *
 * The id token never reaches `accounts` (S3, LATER.md row 278), against
 * Better Auth itself: throwaway instances on the memory adapter, a Google
 * sign-in through the shared harness (Google is the provider that issues an
 * id token; Discord issues none). The control instance carries no account
 * hooks and shows the row the finding described — the provider's JWT stored
 * as sent. With ACCOUNT_HOOKS a new row stores null, the other token columns
 * are untouched, and a row from before S3 loses its plaintext id token at
 * its owner's next sign-in.
 */
import { betterAuth } from "better-auth";
import { describe, expect, it } from "vitest";

import {
  BASE,
  googleIdToken,
  setsSessionCookie,
  socialSignIn,
  type GoogleProfile,
} from "@/test/oauth-harness";

import { ACCOUNT_HOOKS, dropIdToken } from "./account-options";

const PROFILE: GoogleProfile = {
  sub: "google-sub-1",
  name: "Victim",
  email: "idtoken@smoke.invalid",
  email_verified: true,
  picture: "https://lh3.googleusercontent.com/a/victim",
};

function instance(opts: { hooks: boolean }) {
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    socialProviders: { google: { clientId: "test-client", clientSecret: "test-client-secret" } },
    ...(opts.hooks ? { databaseHooks: { account: ACCOUNT_HOOKS } } : {}),
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  });
}
type Auth = ReturnType<typeof instance>;

async function accounts(auth: Auth) {
  const ctx = await auth.$context;
  return ctx.adapter.findMany<Record<string, unknown>>({ model: "account" });
}

describe("control: stock account writes", () => {
  it("store Google's id token as the provider sent it", async () => {
    const auth = instance({ hooks: false });
    expect(setsSessionCookie(await socialSignIn(auth, "google", PROFILE))).toBe(true);
    const [row] = await accounts(auth);
    expect(row?.providerId).toBe("google");
    expect(row?.idToken).toBeTypeOf("string");
    expect(String(row?.idToken).split(".")).toHaveLength(3);
  });
});

describe("with ACCOUNT_HOOKS", () => {
  it("a new account row stores no id token; the other token columns are untouched", async () => {
    const auth = instance({ hooks: true });
    expect(setsSessionCookie(await socialSignIn(auth, "google", PROFILE))).toBe(true);
    const rows = await accounts(auth);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idToken ?? null).toBeNull();
    expect(rows[0]?.accessToken).toBe("provider-access-token");
    expect(rows[0]?.refreshToken).toBe("provider-refresh-token");
    expect(rows[0]?.accountId).toBe(PROFILE.sub);
  });

  it("a row from before S3 loses its plaintext id token at the next sign-in", async () => {
    const auth = instance({ hooks: true });
    const ctx = await auth.$context;
    const now = new Date();
    const legacyUser = await ctx.adapter.create<Record<string, unknown>>({
      model: "user",
      data: {
        name: PROFILE.name,
        email: PROFILE.email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    await ctx.adapter.create({
      model: "account",
      data: {
        userId: legacyUser.id,
        providerId: "google",
        accountId: PROFILE.sub,
        accessToken: "old-access-token",
        idToken: googleIdToken(PROFILE),
        createdAt: now,
        updatedAt: now,
      },
    });
    expect((await accounts(auth))[0]?.idToken).toBeTypeOf("string");

    expect(setsSessionCookie(await socialSignIn(auth, "google", PROFILE))).toBe(true);
    const rows = await accounts(auth);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idToken ?? null).toBeNull();
    // The sign-in refresh ran on the same row — the hook nulled only the id token.
    expect(rows[0]?.accessToken).toBe("provider-access-token");
  });

  it("is one hook on both writes, and it says null, not undefined", async () => {
    expect(ACCOUNT_HOOKS.create.before).toBe(dropIdToken);
    expect(ACCOUNT_HOOKS.update.before).toBe(dropIdToken);
    expect(await dropIdToken()).toEqual({ data: { idToken: null } });
  });
});
