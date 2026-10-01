/**
 * @vitest-environment node
 *
 * X5 step 1, "verify first" (WAVE3.md E): what a returning sign-in writes,
 * against Better Auth itself — throwaway instances on the memory adapter,
 * the provider's two HTTP calls answered by a stubbed fetch (the
 * callback-url.test.ts harness; `disableOriginCheck: false` kept for the
 * same reason — under a test runner the library skips its checks).
 *
 * Five answers, each pinned:
 *  (a) as configured before X5, a second sign-in moves nothing on the user
 *      but emailVerified — which is why users.image froze at sign-up;
 *  (b) with `overrideUserInfoOnSignIn`, the name, the email AND the picture
 *      all move — and an email equal to another user's is written over it
 *      (the memory adapter has no UNIQUE; Postgres would throw: schema.ts);
 *  (c) with the switch and narrowSignInRefresh, only the picture moves, and
 *      the colliding email never reaches the write;
 *  (d) an `input: false` additional field reaches getSession, and a value a
 *      provider's mapProfileToUser offers for it is ignored (measured: the
 *      raw Discord profile — its `avatar` hash — never reaches the user at
 *      all; only a mapper's output does, so the mapper is the threat);
 *  (e) after a direct write, getSession with `disableCookieCache` returns the
 *      new value and re-issues the cache cookie; with `disableRefresh`
 *      added it does not; through the cache it is the old value.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  narrowSignInRefresh,
  OAUTH_CALLBACK_PATH,
  SIGN_IN_REFRESH,
  USER_ADDITIONAL_FIELDS,
} from "./user-fields";

const BASE = "http://localhost:3000";
const DISCORD_ID = "100000000000000001";

type Profile = { name: string; email: string; avatar: string };

const FIRST: Profile = { name: "Bobandis6", email: "first@smoke.invalid", avatar: "aaaa" };
const SECOND: Profile = { name: "Renamed", email: "second@smoke.invalid", avatar: "bbbb" };

function discordPicture(avatar: string): string {
  return `https://cdn.discordapp.com/avatars/${DISCORD_ID}/${avatar}.png`;
}

function instance(
  opts: {
    override?: boolean;
    narrow?: boolean;
    fields?: boolean;
    mapper?: boolean;
    seenPaths?: string[];
  } = {},
) {
  const options = {
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    socialProviders: {
      discord: {
        clientId: "test-client",
        clientSecret: "test-client-secret",
        ...(opts.override ? SIGN_IN_REFRESH : {}),
        // A provider mapper that tries to fill both fields — the only way a
        // provider's profile reaches the user beyond name/email/image.
        ...(opts.mapper
          ? { mapProfileToUser: () => ({ avatar: { kind: "initial" }, username: "from-discord" }) }
          : {}),
      },
    },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    ...(opts.fields ? { user: { additionalFields: USER_ADDITIONAL_FIELDS } } : {}),
    databaseHooks: {
      user: {
        update: {
          before: async (data, context) => {
            opts.seenPaths?.push(String(context?.path));
            return opts.narrow ? narrowSignInRefresh(data, context) : undefined;
          },
        },
      },
    },
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
  return betterAuth(options);
}

type Auth = ReturnType<typeof instance>;

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

/** One full Discord round trip; answers the session cookie header. */
async function signInWith(auth: Auth, profile: Profile): Promise<string> {
  const started = await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ provider: "discord", callbackURL: "/account" }),
    }),
  );
  expect(started.status).toBe(200);
  const { url } = (await started.json()) as { url: string };
  const state = String(new URL(url).searchParams.get("state"));

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const target = decodeURIComponent(String(input instanceof Request ? input.url : input));
      if (target.includes("/oauth2/token")) {
        return Response.json({
          access_token: "provider-access-token",
          refresh_token: "provider-refresh-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "identify email",
        });
      }
      if (target.includes("/users/@me")) {
        return Response.json({
          id: DISCORD_ID,
          username: "bobandis6",
          global_name: profile.name,
          discriminator: "0",
          avatar: profile.avatar,
          email: profile.email,
          verified: true,
        });
      }
      return new Response("unexpected request", { status: 500 });
    }),
  );

  const returned = await auth.handler(
    new Request(
      `${BASE}/api/auth/callback/discord?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookieHeader(started) } },
    ),
  );
  vi.unstubAllGlobals();
  expect(returned.status).toBe(302);
  expect(returned.headers.get("location")).toBe("/account");
  return cookieHeader(returned);
}

async function onlyUser(auth: Auth) {
  const ctx = await auth.$context;
  const account = await ctx.adapter.findOne<{ userId: string }>({
    model: "account",
    where: [{ field: "accountId", value: DISCORD_ID }],
  });
  expect(account).toBeTruthy();
  const user = await ctx.internalAdapter.findUserById(String(account?.userId));
  expect(user).toBeTruthy();
  return user as NonNullable<typeof user> & Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("(a) a returning sign-in, as configured before X5", () => {
  it("moves nothing but emailVerified: the picture stays what it was at sign-up", async () => {
    const auth = instance();
    await signInWith(auth, FIRST);
    const before = await onlyUser(auth);
    expect(before.image).toBe(discordPicture(FIRST.avatar));

    await signInWith(auth, SECOND);
    const after = await onlyUser(auth);
    expect(after.name).toBe(FIRST.name);
    expect(after.email).toBe(FIRST.email);
    expect(after.image).toBe(discordPicture(FIRST.avatar));
  });
});

describe("(b) with overrideUserInfoOnSignIn alone", () => {
  it("rewrites the name, the email and the picture together", async () => {
    const auth = instance({ override: true });
    await signInWith(auth, FIRST);
    await signInWith(auth, SECOND);
    const after = await onlyUser(auth);
    expect(after.name).toBe(SECOND.name);
    expect(after.email).toBe(SECOND.email);
    expect(after.image).toBe(discordPicture(SECOND.avatar));
  });

  it("writes an email another user already has — on Postgres, a UNIQUE violation", async () => {
    const auth = instance({ override: true });
    await signInWith(auth, FIRST);
    const ctx = await auth.$context;
    await ctx.internalAdapter.createUser(
      { name: "Someone else", email: SECOND.email },
      { method: "oauth" },
    );

    await signInWith(auth, SECOND);
    const holders = await ctx.adapter.findMany({
      model: "user",
      where: [{ field: "email", value: SECOND.email }],
    });
    expect(holders).toHaveLength(2);
  });
});

describe("(c) with the switch and narrowSignInRefresh", () => {
  it("moves the picture only — the name and the email stay", async () => {
    const seenPaths: string[] = [];
    const auth = instance({ override: true, narrow: true, seenPaths });
    await signInWith(auth, FIRST);
    await signInWith(auth, SECOND);
    const after = await onlyUser(auth);
    expect(after.image).toBe(discordPicture(SECOND.avatar));
    expect(after.name).toBe(FIRST.name);
    expect(after.email).toBe(FIRST.email);
    expect(after.emailVerified).toBe(true);
    // The hook's scope is real: the refresh's write runs on the callback path.
    expect(seenPaths).toContain(OAUTH_CALLBACK_PATH);
  });

  it("never writes a colliding email: one holder before and after", async () => {
    const auth = instance({ override: true, narrow: true });
    await signInWith(auth, FIRST);
    const ctx = await auth.$context;
    await ctx.internalAdapter.createUser(
      { name: "Someone else", email: SECOND.email },
      { method: "oauth" },
    );

    await signInWith(auth, SECOND);
    const holders = await ctx.adapter.findMany({
      model: "user",
      where: [{ field: "email", value: SECOND.email }],
    });
    expect(holders).toHaveLength(1);
    expect((await onlyUser(auth)).email).toBe(FIRST.email);
  });

  it("leaves every other update alone, on and off the callback path", async () => {
    const ctx = { path: "/somewhere-else" } as Parameters<typeof narrowSignInRefresh>[1];
    expect(await narrowSignInRefresh({ name: "x", image: "y" }, ctx)).toBeUndefined();
    const callback = { path: OAUTH_CALLBACK_PATH } as Parameters<typeof narrowSignInRefresh>[1];
    expect(await narrowSignInRefresh({ emailVerified: true }, callback)).toBeUndefined();
    expect(await narrowSignInRefresh({ name: "x", image: "y" }, null)).toBeUndefined();
  });
});

describe("(d) the additional fields", () => {
  it("reach getSession, and a provider's mapped profile never fills them", async () => {
    const auth = instance({ override: true, narrow: true, fields: true, mapper: true });
    const cookie = await signInWith(auth, FIRST);
    const user = await onlyUser(auth);
    // The mapper offered both fields at sign-up; `input: false` dropped them.
    expect(user.avatar ?? null).toBeNull();
    expect(user.username ?? null).toBeNull();

    const ctx = await auth.$context;
    await ctx.internalAdapter.updateUser(user.id, {
      avatar: { kind: "initial" },
      username: "bobandis6",
    });
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
      query: { disableCookieCache: true },
    });
    const sessionUser = session?.user as Record<string, unknown> | undefined;
    expect(sessionUser?.avatar).toEqual({ kind: "initial" });
    expect(sessionUser?.username).toBe("bobandis6");

    // And a later sign-in — the mapper offering both again — leaves both alone.
    await signInWith(auth, SECOND);
    const after = await onlyUser(auth);
    expect(after.avatar).toEqual({ kind: "initial" });
    expect(after.username).toBe("bobandis6");
  });
});

describe("(e) the cookie cache after a direct write", () => {
  it("disableCookieCache reads the new value and re-issues the cache; disableRefresh does not", async () => {
    const auth = instance({ fields: true });
    const signedIn = await signInWith(auth, FIRST);
    const user = await onlyUser(auth);

    // Prime the cache cookie the way a browser holds it.
    const primed = await auth.api.getSession({
      headers: new Headers({ cookie: signedIn }),
      returnHeaders: true,
    });
    const cacheCookie = primed.headers.getSetCookie().find((c) => c.includes("session_data="));
    const cookie = cacheCookie ? `${signedIn}; ${cacheCookie.split(";")[0]}` : signedIn;
    expect(cookie).toContain("session_data=");

    const ctx = await auth.$context;
    await ctx.internalAdapter.updateUser(user.id, { avatar: { kind: "initial" } });

    // Through the cache: the old value, for up to maxAge.
    const cached = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect((cached?.user as Record<string, unknown> | undefined)?.avatar ?? null).toBeNull();

    // Bypassed: the new value, and a fresh cache cookie on the response.
    const fresh = await auth.api.getSession({
      headers: new Headers({ cookie }),
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
    expect((fresh.response?.user as Record<string, unknown> | undefined)?.avatar).toEqual({
      kind: "initial",
    });
    expect(fresh.headers.getSetCookie().some((c) => c.includes("session_data="))).toBe(true);

    // With disableRefresh too: the new value, but the stale cache cookie stays.
    const unrefreshed = await auth.api.getSession({
      headers: new Headers({ cookie }),
      query: { disableCookieCache: true, disableRefresh: true },
      returnHeaders: true,
    });
    expect((unrefreshed.response?.user as Record<string, unknown> | undefined)?.avatar).toEqual({
      kind: "initial",
    });
    expect(unrefreshed.headers.getSetCookie().some((c) => c.includes("session_data="))).toBe(false);
  });
});
