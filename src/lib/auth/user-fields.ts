/**
 * What the account adds to Better Auth's user, and what a sign-in may
 * rewrite (X5, WAVE3.md D5). Its own module so a test can build a throwaway
 * instance with the same configuration: src/lib/auth.ts needs env and a
 * database at load.
 *
 * The additional fields ride in the session (the header reads them through
 * `useSession`, with no server read) and no client can write them:
 * `input: false` makes Better Auth refuse them on its own profile write
 * (closed anyway — auth-disabled-paths.ts) and skip them when a provider's
 * `mapProfileToUser` offers them (the raw provider profile never reaches the
 * user — measured; only a mapper's output does). The app writes both
 * through Drizzle, from its own routes:
 * `avatar` from PUT /api/profile/avatar, `username` from PATCH /api/profile.
 *
 * The sign-in refresh. Better Auth's `overrideUserInfoOnSignIn` makes a
 * returning sign-in write the provider's name, picture AND email
 * (link-account.mjs: `updateUser(id, { name, image, …, email,
 * emailVerified })`). The owner chose "the picture only" (2026-10-01), and
 * the email must never move: `users.email` is UNIQUE, and a provider email
 * equal to another user's would make the sign-in throw. So the user-update
 * hook below narrows that one write to the picture. Proven against the
 * library in sign-in-refresh.test.ts.
 */
import type { BetterAuthOptions } from "better-auth";

/** `users.avatar` and `users.username`, as Better Auth sees them. */
export const USER_ADDITIONAL_FIELDS = {
  avatar: { type: "json", required: false, input: false },
  username: { type: "string", required: false, input: false },
} as const;

/** The OAuth redirect callback's route path, as the endpoint context reports it. */
export const OAUTH_CALLBACK_PATH = "/callback/:id";

type UserUpdateBefore = NonNullable<
  NonNullable<
    NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>["update"]
  >["before"]
>;

/**
 * On the OAuth callback, an update that carries `image` is the refresh's
 * write: keep the picture, drop the name, the email and its verified flag
 * (an undefined key is skipped by the adapter on an update). Every other
 * update — elsewhere, or the callback's emailVerified-only write for the
 * SAME email — passes untouched.
 */
export const narrowSignInRefresh: UserUpdateBefore = async (data, context) => {
  if (context?.path !== OAUTH_CALLBACK_PATH || !("image" in data)) return;
  return { data: { name: undefined, email: undefined, emailVerified: undefined } };
};

/** The per-provider switch and the hook, spread into betterAuth()'s options. */
export const SIGN_IN_REFRESH = { overrideUserInfoOnSignIn: true } as const;
