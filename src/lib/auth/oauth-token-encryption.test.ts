/**
 * @vitest-environment node
 *
 * OAuth tokens at rest (S2, SECURITY-AUDIT-report.md L8), against Better
 * Auth itself: throwaway instances on the memory adapter, the provider's
 * two HTTP calls answered by a stubbed fetch (the sign-in-refresh.test.ts
 * harness, trimmed to what this needs), the `account` options the
 * production instance uses (account-options.ts).
 *
 *  (a) with ACCOUNT_OPTIONS a sign-in stores the access and refresh tokens
 *      encrypted — not the provider's values, decryptable with the
 *      instance's secret and with no other — while the id token is stored
 *      as sent (the gap, LATER.md row 278);
 *  (b) the library's own read path — the /get-access-token route, closed
 *      in production (auth-disabled-paths.ts) and open on a throwaway
 *      instance — hands back the provider's value from an encrypted row;
 *  (c) a plaintext row from before the switch reads as the plaintext it
 *      holds (no read path chokes on it) and is rewritten encrypted by the
 *      account's next sign-in (updateAccountOnSignIn, the default).
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { symmetricDecrypt } from "better-auth/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_OPTIONS } from "./account-options";

const BASE = "http://localhost:3000";
const SECRET = "test-secret-test-secret-test-secret-0123";
const OTHER_SECRET = "other-secret-other-secret-other-secret-9";
const DISCORD_ID = "100000000000000001";
const PROVIDER = {
  access: "provider-access-token",
  refresh: "provider-refresh-token",
  id: "provider-id-token",
} as const;

/** Better Auth's four tables, shareable between two instances. */
function database(): MemoryDB {
  return { user: [], session: [], account: [], verification: [] };
}

function instance(db: MemoryDB, account?: BetterAuthOptions["account"]) {
  return betterAuth({
    baseURL: BASE,
    secret: SECRET,
    database: memoryAdapter(db),
    socialProviders: {
      discord: { clientId: "test-client", clientSecret: "test-client-secret" },
    },
    ...(account ? { account } : {}),
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions);
}

type Auth = ReturnType<typeof instance>;

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

/** One full Discord round trip (a sign-up the first time, a sign-in after); answers the session cookie header. */
async function signIn(auth: Auth): Promise<string> {
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
          access_token: PROVIDER.access,
          refresh_token: PROVIDER.refresh,
          id_token: PROVIDER.id,
          token_type: "Bearer",
          expires_in: 3600,
          scope: "identify email",
        });
      }
      if (target.includes("/users/@me")) {
        return Response.json({
          id: DISCORD_ID,
          username: "bobandis6",
          global_name: "Bobandis6",
          discriminator: "0",
          avatar: "aaaa",
          email: "first@smoke.invalid",
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

/**
 * The library's read path: the closed /get-access-token route, open on a
 * throwaway instance. It selects the account by its row id (1.7.10's
 * `accountSelectionSchema`), from the session in the cookie.
 */
async function accessTokenThrough(auth: Auth, cookie: string): Promise<string> {
  const { id } = await storedAccount(auth);
  const res = await auth.handler(
    new Request(`${BASE}/api/auth/get-access-token`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, cookie },
      body: JSON.stringify({ accountId: id }),
    }),
  );
  const text = await res.text();
  expect(res.status, text).toBe(200);
  return (JSON.parse(text) as { accessToken: string }).accessToken;
}

type StoredAccount = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
};

async function storedAccount(auth: Auth): Promise<StoredAccount> {
  const ctx = await auth.$context;
  const account = await ctx.adapter.findOne<StoredAccount>({
    model: "account",
    where: [{ field: "accountId", value: DISCORD_ID }],
  });
  expect(account).toBeTruthy();
  return account as StoredAccount;
}

const HEX = /^[0-9a-f]+$/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("(a) with ACCOUNT_OPTIONS", () => {
  it("stores the access and refresh tokens encrypted under the secret, the id token as sent", async () => {
    const auth = instance(database(), ACCOUNT_OPTIONS);
    await signIn(auth);
    const row = await storedAccount(auth);

    expect(row.accessToken).not.toBe(PROVIDER.access);
    expect(row.refreshToken).not.toBe(PROVIDER.refresh);
    // XChaCha20-Poly1305 as hex — one secret, so no `$ba$` version envelope — with the
    // nonce inside, so the same token never writes the same bytes twice.
    expect(row.accessToken).toMatch(HEX);
    expect(row.refreshToken).toMatch(HEX);
    expect(row.accessToken).not.toBe(row.refreshToken);
    expect(await symmetricDecrypt({ key: SECRET, data: String(row.accessToken) })).toBe(
      PROVIDER.access,
    );
    expect(await symmetricDecrypt({ key: SECRET, data: String(row.refreshToken) })).toBe(
      PROVIDER.refresh,
    );
    await expect(
      symmetricDecrypt({ key: OTHER_SECRET, data: String(row.accessToken) }),
    ).rejects.toThrow();

    // The gap the option's comment does not mention (LATER.md row 278).
    expect(row.idToken).toBe(PROVIDER.id);
  });
});

describe("(b) the read path", () => {
  it("hands back the provider's value from an encrypted row — the closed route, open here", async () => {
    const auth = instance(database(), ACCOUNT_OPTIONS);
    const cookie = await signIn(auth);
    expect((await storedAccount(auth)).accessToken).not.toBe(PROVIDER.access);
    expect(await accessTokenThrough(auth, cookie)).toBe(PROVIDER.access);
  });
});

describe("(c) a row from before the switch", () => {
  it("reads as the plaintext it holds, then is rewritten encrypted by the next sign-in", async () => {
    const db = database();
    const before = instance(db);
    const legacyCookie = await signIn(before);
    const legacy = await storedAccount(before);
    expect(legacy.accessToken).toBe(PROVIDER.access);
    expect(legacy.refreshToken).toBe(PROVIDER.refresh);

    // The switch flips with the row still plaintext: the same session, read by the
    // encrypting instance — the value passes through, and the read rewrites nothing.
    const after = instance(db, ACCOUNT_OPTIONS);
    expect(await accessTokenThrough(after, legacyCookie)).toBe(PROVIDER.access);
    expect((await storedAccount(after)).accessToken).toBe(PROVIDER.access);

    const cookie = await signIn(after);
    const healed = await storedAccount(after);
    expect(healed.accessToken).not.toBe(PROVIDER.access);
    expect(healed.refreshToken).not.toBe(PROVIDER.refresh);
    expect(await symmetricDecrypt({ key: SECRET, data: String(healed.accessToken) })).toBe(
      PROVIDER.access,
    );
    expect(await symmetricDecrypt({ key: SECRET, data: String(healed.refreshToken) })).toBe(
      PROVIDER.refresh,
    );
    expect(await accessTokenThrough(after, cookie)).toBe(PROVIDER.access);
    // The same account row throughout: the second instance signed the same user in.
    expect(db.account).toHaveLength(1);
    expect(db.user).toHaveLength(1);
  });
});
