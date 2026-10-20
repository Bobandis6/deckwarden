/**
 * The verified-email gate on sign-up, and where a failed sign-in lands (S3,
 * SECURITY-AUDIT-report.md M4). Its own module so a throwaway instance can be
 * built from the same values (the user-fields.ts pattern): src/lib/auth.ts
 * needs env and a database at load.
 *
 * The squat. Before S3 an OAuth sign-up inserted the `users` row with whatever
 * `emailVerified` the provider reported — `dist/oauth2/link-account.mjs`
 * (1.7.10) creates the user with `emailVerified: userInfo.emailVerified` and
 * never looks at the flag first. Discord reports `verified: false` for an
 * account whose email was never confirmed, so anyone could register a Discord
 * account with somebody else's address, sign in here, and own a `users` row
 * carrying that email. The real owner's later verified Google sign-in then
 * refuses to link (the local row is unverified; `requireLocalEmailVerified`
 * defaults on) and they can never register. A lockout, not a takeover — the
 * same default keeps the squatter out of a verified account.
 *
 * Two locks, in this order:
 *
 *  1. `refuseUnverifiedUserInsert`, a `databaseHooks.user.create.before`: the
 *     INSERT itself is refused unless the row says `emailVerified: true`. It
 *     throws the library's own OAuth code instead of returning `false`: a
 *     `false` makes the create answer null, the register branch then dies on
 *     `createdUser.id` and the callback answers a generic
 *     `unable_to_create_user`; a thrown APIError is rethrown by that branch
 *     (`if (isAPIError(e)) throw e`) and the callback redirects with the
 *     error's code (`callback.mjs`: `redirectOnError(e.body.code, …)`).
 *     Nothing was written: the hook runs before the adapter's create, and
 *     the account row comes after the user row. Not scoped to the OAuth
 *     callback on purpose — no path may mint a user with an unverified email.
 *  2. `REQUIRE_VERIFIED_EMAIL`, the per-provider `requireEmailVerification`:
 *     the library's own check. It alone does NOT prevent the squat — it runs
 *     after the insert and only withholds the session (its doc comment:
 *     "the user and account are still created/linked, but no session is
 *     issued") — but it also refuses a session to a row that is ALREADY
 *     unverified, which lock 1 cannot reach. It reads the local row's flag,
 *     so a user verified once keeps access if a provider later reports the
 *     email unverified, and a legacy unverified row heals at its next
 *     verified sign-in: the callback flips `emailVerified` before the check.
 *
 * `OAUTH_ERROR_LANDING`: a failed callback used to redirect to Better Auth's
 * own `/api/auth/error` page (measured on production, 2026-10-19: a callback
 * with no state answered `302 /api/auth/error?error=state_not_found`). With
 * `onAPIError.errorURL` set, `parseState` fills the state's missing errorURL
 * from it and the callback lands on /account, where sign-in-error.ts turns
 * the code into one sentence. The router reads only `throw` and `onError`
 * from onAPIError, so JSON errors are unchanged.
 *
 * Proven against the library in verified-email.test.ts.
 */
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";

type UserCreateBefore = NonNullable<
  NonNullable<
    NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>["create"]
  >["before"]
>;

/** The callback's `?error=` code — the same one lock 2 produces. */
export const EMAIL_NOT_VERIFIED = "email_not_verified";

/** Lock 1: no `users` row without a verified email, whatever the path. */
export const refuseUnverifiedUserInsert: UserCreateBefore = async (user) => {
  if (user.emailVerified === true) return;
  throw new APIError("FORBIDDEN", {
    code: EMAIL_NOT_VERIFIED,
    message: "Sign-in needs an email address the provider has verified.",
  });
};

/** Lock 2, spread into each provider's options beside SIGN_IN_REFRESH. */
export const REQUIRE_VERIFIED_EMAIL = { requireEmailVerification: true } as const;

/** Where the OAuth callback sends a failure: the sign-in page, which explains it. */
export const OAUTH_ERROR_LANDING = { errorURL: "/account" } as const satisfies NonNullable<
  BetterAuthOptions["onAPIError"]
>;
