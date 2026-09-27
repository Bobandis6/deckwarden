/**
 * @vitest-environment node
 *
 * The return path against Better Auth itself (X1, WAVE3.md D1 / REC-1) — the
 * half of the sign-in round trip the browser pane cannot drive (it would
 * mean entering credentials). Throwaway instances, no database (the memory
 * adapter), none of the env src/lib/auth.ts needs at load; the provider's
 * two HTTP calls are answered by a stubbed fetch.
 *
 * `advanced.disableOriginCheck: false` is LOAD-BEARING. Under a test runner
 * the library skips its origin and callbackURL checks by default
 * (create-context: `isTest() ? true : false`), so without that line every
 * assertion here would pass against a library that checks nothing. The
 * refusals in the first test are the control that proves the check is live.
 *
 * What is pinned:
 *  - the callback the buttons build passes the library's check;
 *  - the library validates the callback's PATH part only and never looks
 *    inside the query — so safeNextPath is the only gate for `next`;
 *  - the callback survives the whole round trip: the provider's redirect
 *    ends on /account?next=… byte for byte, signed in.
 */
import { betterAuth } from "better-auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import { accountHref, safeNextPath } from "./next-path";

const BASE = "http://localhost:3000";
const DECK_PATH = "/d/uwvrnv2pv4t6";

function instance() {
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    socialProviders: { discord: { clientId: "test-client", clientSecret: "test-client-secret" } },
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  });
}

function signIn(callbackURL: string): Request {
  return new Request(`${BASE}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ provider: "discord", callbackURL }),
  });
}

/** name=value pairs of every Set-Cookie on a response, as one Cookie header. */
function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Better Auth's callbackURL check (the control)", () => {
  it("is live on this instance: another host is refused with 403", async () => {
    const auth = instance();
    for (const callbackURL of [
      "//evil.example/account",
      "https://evil.example/account",
      "/\\evil.example",
      "/%2Fevil.example",
    ]) {
      const res = await auth.handler(signIn(callbackURL));
      expect(res.status, callbackURL).toBe(403);
    }
  });
});

describe("the callback the sign-in buttons build", () => {
  it("passes: plain /account, and /account with the return path in its query", async () => {
    const auth = instance();
    for (const callbackURL of [accountHref(), accountHref(DECK_PATH)]) {
      const res = await auth.handler(signIn(callbackURL));
      expect(res.status, callbackURL).toBe(200);
      const json = (await res.json()) as { url: string; redirect: boolean };
      expect(json.redirect).toBe(true);
      expect(new URL(json.url).origin).toBe("https://discord.com");
    }
    expect(accountHref(DECK_PATH)).toBe("/account?next=%2Fd%2Fuwvrnv2pv4t6");
  });

  it("the library never looks inside the query — safeNextPath is the only gate for next", async () => {
    const crafted = "/account?next=%2F%2Fevil.example";
    // The library lets it through: its path part is just /account.
    expect((await instance().handler(signIn(crafted))).status).toBe(200);
    // Ours does not: the value the page would read back is refused…
    const next = new URL(crafted, BASE).searchParams.get("next");
    expect(next).toBe("//evil.example");
    expect(safeNextPath(next)).toBeNull();
    // …and the buttons could never have built that callback in the first place.
    expect(accountHref("//evil.example")).toBe("/account");
  });
});

describe("the whole round trip", () => {
  it("ends on the callback byte for byte, with a session", async () => {
    const auth = instance();
    const callbackURL = accountHref(DECK_PATH);

    // 1. The button's POST: the library answers with the provider's URL and its state cookies.
    const started = await auth.handler(signIn(callbackURL));
    expect(started.status).toBe(200);
    const { url } = (await started.json()) as { url: string };
    const state = new URL(url).searchParams.get("state");
    expect(state).toBeTruthy();
    const redirectUri = new URL(url).searchParams.get("redirect_uri");
    expect(redirectUri).toBe(`${BASE}/api/auth/callback/discord`);

    // 2. The provider's two calls, answered here.
    const providerCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        // Decoded: the library requests /users/%40me.
        const target = decodeURIComponent(String(input instanceof Request ? input.url : input));
        providerCalls.push(target);
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
            id: "100000000000000001",
            username: "bobandis6",
            global_name: "Bobandis6",
            discriminator: "0",
            avatar: null,
            email: "round-trip@smoke.invalid",
            verified: true,
          });
        }
        return new Response("unexpected request", { status: 500 });
      }),
    );

    // 3. The provider sends the browser back, carrying the state and the cookies from step 1.
    const returned = await auth.handler(
      new Request(`${redirectUri}?code=test-code&state=${encodeURIComponent(String(state))}`, {
        headers: { cookie: cookieHeader(started) },
      }),
    );

    expect(providerCalls).toEqual([
      "https://discord.com/api/oauth2/token",
      "https://discord.com/api/users/@me",
    ]);
    expect(returned.status).toBe(302);
    expect(returned.headers.get("location")).toBe(callbackURL);
    // Signed in: the session cookie rides on the same redirect.
    expect(cookieHeader(returned)).toContain("better-auth.session_token=");

    // 4. What the account page then reads is the deck's path, validated.
    const landed = new URL(String(returned.headers.get("location")), BASE);
    expect(landed.pathname).toBe("/account");
    expect(safeNextPath(landed.searchParams.get("next"))).toBe(DECK_PATH);
  });
});
