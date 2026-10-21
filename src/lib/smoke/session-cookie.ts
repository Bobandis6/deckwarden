/**
 * The session cookie a smoke sends to sign a minted user in (S9,
 * SECURITY-AUDIT-report.md L19, I8): better-call's signed-cookie scheme —
 * `token + "." + base64(HMAC-SHA256(secret, token))`, URI-encoded
 * (`better-call/dist/crypto.mjs`, `signCookieValue`) — under both the plain
 * and the `__Secure-` cookie name, because Better Auth tries the prefixed
 * name first and the plain one second (`better-auth/dist/cookies/index.mjs`)
 * and a script should not have to know which mode the server runs in. Pure:
 * `scripts/smoke/session.ts` inserts the rows and calls this.
 */
import { createHmac } from "node:crypto";

export const SESSION_COOKIE = "better-auth.session_token";

/** The `Cookie` header value for `token`, signed with `secret`. */
export function signedSessionCookie(token: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(token).digest("base64");
  const value = encodeURIComponent(`${token}.${sig}`);
  return `${SESSION_COOKIE}=${value}; __Secure-${SESSION_COOKIE}=${value}`;
}
