/**
 * @vitest-environment node
 *
 * The session payload without its token (S3, SECURITY-AUDIT-report.md L9),
 * against Better Auth itself: throwaway instances on the memory adapter, a
 * Discord sign-in through the shared harness, and the three readers — GET
 * /get-session as the header's useSession issues it (the database path, the
 * cookie-cache path and the bypass), auth.api.getSession as server code calls
 * it, and GET /list-sessions. The control instance carries no hook and shows
 * the stock body: the session token the httpOnly cookie exists to hide, next
 * to the IP address and the user agent. Sign-out still works afterwards, so
 * the library's own session reads were untouched.
 */
import { betterAuth } from "better-auth";
import { describe, expect, it } from "vitest";

import {
  BASE,
  cookieHeader,
  setsSessionCookie,
  socialSignIn,
  type DiscordProfile,
} from "@/test/oauth-harness";

import {
  SESSION_PAYLOAD_HOOKS,
  STRIPPED_SESSION_FIELDS,
  stripSessionPayload,
} from "./session-payload";

const PROFILE: DiscordProfile = {
  id: "100000000000000001",
  name: "Bobandis6",
  email: "payload@smoke.invalid",
  verified: true,
};

function instance(opts: { strip: boolean }) {
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    socialProviders: { discord: { clientId: "test-client", clientSecret: "test-client-secret" } },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    ...(opts.strip ? { hooks: SESSION_PAYLOAD_HOOKS } : {}),
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  });
}
type Auth = ReturnType<typeof instance>;
type Body = { session: Record<string, unknown>; user: Record<string, unknown> } | null;

/**
 * The sign-in's cookies. The callback sets the session token AND the cookie
 * cache (`session_data`); `tokenOnly` drops the cache so a read goes to the
 * database, the way a browser whose cache cookie expired or was cleared reads.
 */
async function signedIn(auth: Auth): Promise<{ all: string; tokenOnly: string }> {
  const returned = await socialSignIn(auth, "discord", PROFILE);
  expect(returned.status).toBe(302);
  expect(setsSessionCookie(returned)).toBe(true);
  const all = cookieHeader(returned);
  const tokenOnly = all
    .split("; ")
    .filter((pair) => !pair.includes("session_data="))
    .join("; ");
  expect(tokenOnly).not.toBe(all);
  return { all, tokenOnly };
}

async function getSession(auth: Auth, cookie: string, query = ""): Promise<Response> {
  const res = await auth.handler(
    new Request(`${BASE}/api/auth/get-session${query}`, { headers: { cookie } }),
  );
  expect(res.status).toBe(200);
  return res;
}

function expectStripped(session: Record<string, unknown>) {
  for (const field of STRIPPED_SESSION_FIELDS) expect(session).not.toHaveProperty(field);
  expect(session.id).toBeTypeOf("string");
  expect(session.userId).toBeTypeOf("string");
  expect(session.expiresAt).toBeTruthy();
}

describe("control: the stock /get-session body", () => {
  it("carries the session token, the IP address and the user agent", async () => {
    const auth = instance({ strip: false });
    const { tokenOnly: cookie } = await signedIn(auth);
    const body = (await (await getSession(auth, cookie)).json()) as Body;
    expect(body?.session.token).toBeTypeOf("string");
    expect(body?.session).toHaveProperty("ipAddress");
    expect(body?.session).toHaveProperty("userAgent");
    // The token in the body IS the cookie's bearer.
    expect(cookie).toContain(encodeURIComponent(String(body?.session.token)).slice(0, 16));
  });
});

describe("with SESSION_PAYLOAD_HOOKS", () => {
  it("GET /get-session answers without the three, on every path to the session", async () => {
    const auth = instance({ strip: true });
    const { tokenOnly: cookie } = await signedIn(auth);

    // 1. The database path (no cache cookie sent); it issues the cache cookie.
    const first = await getSession(auth, cookie);
    const body = (await first.json()) as Body;
    expect(body).not.toBeNull();
    expectStripped(body!.session);
    expect(body!.user.email).toBe(PROFILE.email);
    const cacheCookie = first.headers.getSetCookie().find((c) => c.includes("session_data="));
    expect(cacheCookie).toBeTruthy();

    // 2. The cookie-cache path, as every later page view reads it.
    const cached = `${cookie}; ${String(cacheCookie).split(";")[0]}`;
    const second = (await (await getSession(auth, cached)).json()) as Body;
    expectStripped(second!.session);

    // 3. The bypass the picture writer uses after a change.
    const bypassed = (await (
      await getSession(auth, cached, "?disableCookieCache=true")
    ).json()) as Body;
    expectStripped(bypassed!.session);
  });

  it("auth.api.getSession — server code — gets the same shape, user intact", async () => {
    const auth = instance({ strip: true });
    const { all: cookie } = await signedIn(auth);
    const session = (await auth.api.getSession({
      headers: new Headers({ cookie }),
    })) as unknown as Body;
    expect(session).not.toBeNull();
    expectStripped(session!.session);
    expect(session!.user.id).toBe(session!.session.userId);
  });

  it("GET /list-sessions lists sessions without their tokens", async () => {
    const auth = instance({ strip: true });
    const { all: cookie } = await signedIn(auth);
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/list-sessions`, { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const list = (await res.json()) as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expectStripped(list[0]!);
  });

  it("a signed-out visitor still reads null, and sign-out still works", async () => {
    const auth = instance({ strip: true });
    const anonymous = await auth.handler(new Request(`${BASE}/api/auth/get-session`));
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toBeNull();

    const { all, tokenOnly } = await signedIn(auth);
    const out = await auth.handler(
      new Request(`${BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: { cookie: all, origin: BASE, "content-type": "application/json" },
      }),
    );
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ success: true });
    // The response clears both cookies; a browser sends neither afterwards.
    // (A stale cache cookie would still answer for up to its 5 minutes — the
    // documented revocation lag, not this test's subject.)
    expect(out.headers.getSetCookie().some((c) => /session_token=;/.test(c))).toBe(true);
    const after = await auth.handler(
      new Request(`${BASE}/api/auth/get-session`, { headers: { cookie: tokenOnly } }),
    );
    expect(await after.json()).toBeNull();
  });
});

describe("stripSessionPayload", () => {
  it("names exactly the three fields", () => {
    expect(STRIPPED_SESSION_FIELDS).toEqual(["token", "ipAddress", "userAgent"]);
  });

  it("leaves a null, an error and other paths alone", () => {
    expect(stripSessionPayload("/get-session", null)).toBeUndefined();
    expect(stripSessionPayload("/get-session", { message: "Unauthorized" })).toBeUndefined();
    expect(stripSessionPayload("/sign-out", { success: true })).toBeUndefined();
    expect(stripSessionPayload("/list-sessions", null)).toBeUndefined();
  });

  it("strips a session object and each entry of a list, keeping the rest", () => {
    const session = { id: "s1", userId: "u1", token: "t", ipAddress: "1.1.1.1", userAgent: "x" };
    expect(stripSessionPayload("/get-session", { session, user: { id: "u1" } })).toEqual({
      session: { id: "s1", userId: "u1" },
      user: { id: "u1" },
    });
    expect(stripSessionPayload("/list-sessions", [session, session])).toEqual([
      { id: "s1", userId: "u1" },
      { id: "s1", userId: "u1" },
    ]);
  });
});
