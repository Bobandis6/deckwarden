/**
 * What /account says when a sign-in did not finish (S3, SECURITY-AUDIT-
 * report.md M4, and the silent `?error=` redirect the verifier flagged). The
 * OAuth callback lands on `/account?error=<code>` (verified-email.ts,
 * OAUTH_ERROR_LANDING); the page passes the raw query value through here and
 * renders the sentence — never the value itself. An allowlist, so a crafted
 * link can put nothing of its own on the page; every other non-empty code
 * gets the one generic line.
 *
 * The codes are Better Auth 1.7.10's (`dist/oauth2/errors.mjs`, and the
 * `result.error` strings of `link-account.mjs` underscored by the callback),
 * plus `access_denied`, which Discord and Google send back when the visitor
 * cancels at the provider.
 */
const SENTENCES = new Map<string, string>([
  [
    "email_not_verified",
    "That account's email address isn't verified yet. Verify it with Discord or Google, then sign in again.",
  ],
  [
    "account_not_linked",
    "An account with this email already exists, and the provider you chose hasn't verified the address. Sign in the way you did before, or verify the email there first.",
  ],
  [
    "unable_to_create_user",
    "The account couldn't be created. Try again, or try the other provider.",
  ],
  ["access_denied", "Sign-in was cancelled at the provider."],
]);

const FALLBACK = "Sign-in didn't finish. Try again.";

/** The sentence for a `?error=` value, or null when there is nothing to show. */
export function signInErrorMessage(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (!code) return null;
  return SENTENCES.get(code) ?? FALLBACK;
}
