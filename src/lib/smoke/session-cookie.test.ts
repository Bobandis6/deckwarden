// @vitest-environment node
/**
 * The minted session cookie is what Better Auth reads (S9, L19/I8): the
 * signature is checked against Web Crypto's HMAC-SHA256 — the path
 * better-call's own `signCookieValue` takes (`subtle.sign` + `btoa`) — so the
 * node:crypto spelling here and the library's agree on the bytes, not just on
 * each other.
 */
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE, signedSessionCookie } from "./session-cookie";

/** better-call's `makeSignature`, as crypto.mjs spells it. */
async function betterCallSignature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

describe("signedSessionCookie", () => {
  it("signs the token the way better-call's signCookieValue does, URI-encoded", async () => {
    const token = "0123456789abcdef0123456789abcdef0123456789abcdef";
    const secret = "a smoke secret";
    const expected = encodeURIComponent(`${token}.${await betterCallSignature(token, secret)}`);
    expect(signedSessionCookie(token, secret)).toBe(
      `better-auth.session_token=${expected}; __Secure-better-auth.session_token=${expected}`,
    );
    expect(expected).toContain("%3D"); // the base64 padding is encoded, as the library encodes it
  });

  it("carries the value under the plain and the __Secure- name, the plain one first", () => {
    expect(SESSION_COOKIE).toBe("better-auth.session_token");
    const cookie = signedSessionCookie("t", "s");
    const [plain, secure] = cookie.split("; ");
    expect(plain.startsWith("better-auth.session_token=")).toBe(true);
    expect(secure.startsWith("__Secure-better-auth.session_token=")).toBe(true);
    expect(plain.slice(plain.indexOf("=") + 1)).toBe(secure.slice(secure.indexOf("=") + 1));
  });

  it("changes with the secret and with the token", () => {
    expect(signedSessionCookie("t", "s")).not.toBe(signedSessionCookie("t", "s2"));
    expect(signedSessionCookie("t", "s")).not.toBe(signedSessionCookie("t2", "s"));
  });
});
