/**
 * Username slugs for public profiles (P2.2, /u/[username]).
 *
 * One canonical form: lowercase a–z/0–9 with interior hyphens, 3–24 chars.
 * Input is folded to lowercase rather than rejected (usernames are
 * case-insensitive everywhere they're typed), so the DB only ever holds the
 * canonical spelling and a plain UNIQUE constraint is case-safe. The /u/
 * prefix means route collisions are impossible; the reserved list is purely
 * anti-impersonation.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

/** Lowercase alphanumeric, hyphens allowed but not leading/trailing. 3–24 chars. */
const USERNAME_REGEX = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;

/** Impersonation-prone names only — routing can't clash under /u/. */
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "mod",
  "moderator",
  "staff",
  "support",
  "official",
  "deckwarden",
  "system",
  "root",
  "anonymous",
  "deleted",
  "account",
  "settings",
  "api",
  "help",
  "about",
  "team",
]);

export type UsernameCheck = { ok: true; username: string } | { ok: false; error: string };

/** Fold + validate; returns the canonical lowercase slug or a user-facing error. */
export function checkUsername(raw: string): UsernameCheck {
  const username = raw.trim().toLowerCase();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return {
      ok: false,
      error: `Usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters.`,
    };
  }
  if (!USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      error: "Usernames use letters, numbers, and hyphens (not at the start or end).",
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, error: "That username is reserved." };
  }
  return { ok: true, username };
}

/** Shape gate for /u/[username] lookups — skips the DB roundtrip for junk URLs. */
export function isUsernameShaped(raw: string): boolean {
  return USERNAME_REGEX.test(raw.toLowerCase());
}
