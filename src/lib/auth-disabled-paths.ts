/**
 * Better Auth routes this app closes (P2.9 round 2; the token routes since
 * X1, WAVE3.md REC-6). The library mounts its whole stock API under
 * /api/auth; a path listed here answers 404 before anything else on the
 * request runs.
 *
 * "/update-user" writes `name` and `image` for the signed-in user with no
 * validation — any text, any URL on any host — and both render on public
 * pages (/u/[username], deck bylines). Nothing in the app calls it. A
 * change-picture feature must bring its own validated route handler rather
 * than reopen this one.
 *
 * "/get-access-token", "/refresh-token" and "/account-info" hand the
 * signed-in user's OWN Discord or Google tokens and provider profile to page
 * JavaScript. The app never uses a provider token after sign-in, so they are
 * unused surface — and the one that would turn a script-injection bug into
 * provider-token theft. A feature that needs a provider token in the browser
 * has to reopen its route on purpose, here.
 *
 * Its own module so a test can import the list: src/lib/auth.ts needs env
 * and a database at load. Pinned by auth-disabled-paths.test.ts (the list
 * against the library) and scripts/account-delete-smoke.ts (the wiring, on a
 * live server). This closes the HTTP routes only — the auth.api functions
 * stay callable from server code, and none calls them.
 */
export const AUTH_DISABLED_PATHS: string[] = [
  "/update-user",
  "/get-access-token",
  "/refresh-token",
  "/account-info",
];
