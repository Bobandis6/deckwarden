/**
 * Better Auth routes this app closes (P2.9 round 2). The library mounts its
 * whole stock API under /api/auth; a path listed here answers 404 before
 * anything else on the request runs.
 *
 * "/update-user" writes `name` and `image` for the signed-in user with no
 * validation — any text, any URL on any host — and both render on public
 * pages (/u/[username], deck bylines). Nothing in the app calls it. A
 * change-picture feature must bring its own validated route handler rather
 * than reopen this one.
 *
 * Its own module so a test can import the list: src/lib/auth.ts needs env
 * and a database at load. Pinned by auth-disabled-paths.test.ts (the list
 * against the library) and scripts/account-delete-smoke.ts (the wiring, on a
 * live server). This closes the HTTP route only — auth.api.updateUser stays
 * callable from server code, and none calls it.
 */
export const AUTH_DISABLED_PATHS: string[] = ["/update-user"];
