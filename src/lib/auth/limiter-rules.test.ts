/**
 * @vitest-environment node
 *
 * The /get-session exemption (S3, SECURITY-AUDIT-report.md L21), against
 * Better Auth's own limiter: throwaway instances with a storage that records
 * every `consume`. The control instance carries no custom rules and shows
 * the stock behaviour the finding measured — a counter write for every
 * GET /get-session; the S3 instance makes zero storage calls for it and
 * still counts a sign-in under the stock 3-per-10-seconds rule.
 */
import { betterAuth } from "better-auth";
import { beforeEach, describe, expect, it } from "vitest";

import { AUTH_RATE_LIMIT_RULES } from "./limiter-rules";

const BASE = "http://localhost:3000";

let consumed: { key: string; rule: { window: number; max: number } }[] = [];
const recordingStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    consumed.push({ key, rule });
    return { allowed: true, retryAfter: null };
  },
};

function instance(rules: typeof AUTH_RATE_LIMIT_RULES | null) {
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    socialProviders: { discord: { clientId: "test-client", clientSecret: "test-client-secret" } },
    rateLimit: {
      enabled: true,
      customStorage: recordingStorage,
      ...(rules ? { customRules: rules } : {}),
    },
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  });
}

const IP = { "x-forwarded-for": "203.0.113.9" };

function getSession(auth: ReturnType<typeof instance>) {
  return auth.handler(new Request(`${BASE}/api/auth/get-session`, { headers: IP }));
}

function signIn(auth: ReturnType<typeof instance>) {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, ...IP },
      body: JSON.stringify({ provider: "discord", callbackURL: "/account" }),
    }),
  );
}

beforeEach(() => {
  consumed = [];
});

describe("the rules", () => {
  it("exempt exactly one path, /get-session", () => {
    expect(AUTH_RATE_LIMIT_RULES).toEqual({ "/get-session": false });
  });
});

describe("control: the stock limiter", () => {
  it("writes a counter for every GET /get-session, signed out or not", async () => {
    const auth = instance(null);
    expect((await getSession(auth)).status).toBe(200);
    expect((await getSession(auth)).status).toBe(200);
    expect(consumed).toHaveLength(2);
    expect(consumed[0]?.key).toContain("/get-session");
    expect(consumed[0]?.rule).toEqual({ window: 10, max: 100 });
  });
});

describe("with AUTH_RATE_LIMIT_RULES", () => {
  it("makes no storage call for GET /get-session", async () => {
    const auth = instance(AUTH_RATE_LIMIT_RULES);
    expect((await getSession(auth)).status).toBe(200);
    expect((await getSession(auth)).status).toBe(200);
    expect(consumed).toEqual([]);
  });

  it("still counts a sign-in under the stock 3-per-10-seconds rule", async () => {
    const auth = instance(AUTH_RATE_LIMIT_RULES);
    expect((await signIn(auth)).status).toBe(200);
    expect(consumed).toHaveLength(1);
    expect(consumed[0]?.key).toContain("/sign-in/social");
    expect(consumed[0]?.rule).toEqual({ window: 10, max: 3 });
  });
});
