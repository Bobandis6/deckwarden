/**
 * Better Auth's `account` options (S2, SECURITY-AUDIT-report.md L8): the
 * provider tokens at rest. Its own module so the throwaway-instance test
 * (oauth-token-encryption.test.ts) builds an instance from the same value —
 * src/lib/auth.ts needs env and a database at load (the user-fields.ts
 * pattern).
 *
 * Every sign-in stores the provider's access token (and Discord's refresh
 * token; Google issues none without `accessType: "offline"`) in `accounts`.
 * The app never reads them — the three routes that would hand them out are
 * closed in auth-disabled-paths.ts — so they were plaintext bearer tokens
 * in the database and every backup of it, for nothing. With
 * `encryptOAuthTokens`, Better Auth runs the access and refresh tokens
 * through XChaCha20-Poly1305 under the secret (BETTER_AUTH_SECRET) on every
 * write — sign-up, link, the sign-in refresh (dist/oauth2/link-account.mjs)
 * — and through `decryptOAuthToken` on the way out.
 *
 * What the library does with rows from before the switch (read in
 * dist/oauth2/utils.mjs, 1.7.10): decryption runs only on a value that
 * looks encrypted (a `$ba$` envelope, or even-length hex — a Discord or
 * Google token is neither), a plaintext value passes through unchanged,
 * and the sign-in refresh (`updateAccountOnSignIn`, on by default)
 * rewrites the tokens encrypted at the account's next sign-in. So no read
 * path chokes on a legacy row, and every existing row heals itself the
 * next time its owner signs in. Not covered: the id token — the library
 * stores `idToken` as the provider sent it on every path, whatever the
 * option's comment says (LATER.md row 278). The key is the secret: a
 * rotated BETTER_AUTH_SECRET makes the stored tokens undecryptable, which
 * only the closed routes could notice, and the next sign-in rewrites them.
 */
import type { BetterAuthOptions } from "better-auth";

export const ACCOUNT_OPTIONS = {
  encryptOAuthTokens: true,
} as const satisfies NonNullable<BetterAuthOptions["account"]>;
