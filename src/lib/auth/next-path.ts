/**
 * The way back after sign-in (X1, WAVE3.md D1 / REC-1).
 *
 * A sign-in prompt on a deck page links /account?next=<that page>. The
 * account page hands the value to the sign-in buttons — it rides inside
 * Better Auth's callbackURL, in the QUERY, because the library validates the
 * callback's path part only — and, once signed in, to ClaimDecks, which
 * returns there after the claim settles. /account stays the landing spot of
 * every sign-in because the claim runs there: the return goes through it,
 * never around it.
 *
 * safeNextPath is the ONE gate. `next` arrives in a URL anyone can craft, so
 * every reader goes through here, and an invalid value is ignored silently —
 * the page behaves exactly as if the parameter were absent. Accepted: a
 * root-relative path on this site. Refused: anything a browser or a router
 * could read as another host (`//`, a backslash, a control character — raw
 * or percent-encoded), /account itself (a return to the page you are on is a
 * loop), /api/ (not a page), and anything over 200 characters.
 *
 * Pure — no window, no env: the account page (server), the buttons and the
 * prompts (client) share it. The library's half is pinned separately
 * (callback-url.test.ts): it never looks inside the query, so this module is
 * the only thing between a crafted `next` and the redirect.
 */

/** Longest `next` accepted, measured on the value as it arrived. */
export const NEXT_PATH_MAX_LENGTH = 200;

/** Parser base for root-relative values; `.invalid` never resolves (RFC 2606). */
const PARSE_ORIGIN = "https://deckwarden.invalid";

/** C0 and C1 controls plus DEL — URL parsers strip tabs and newlines, so `/\t/host` would read `//host`. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** One leading slash, and nothing that could start an authority or hide one. */
function isPlainRootRelative(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.includes("//") &&
    !value.includes("\\") &&
    !hasControlCharacter(value)
  );
}

function isReserved(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return (
    path === "/account" ||
    path.startsWith("/account/") ||
    path === "/api" ||
    path.startsWith("/api/")
  );
}

/**
 * The validated return path — normalized to pathname + search + hash — or
 * null. Takes `unknown` on purpose: a searchParams value may be a string, an
 * array (`?next=a&next=b`, refused as ambiguous) or missing.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > NEXT_PATH_MAX_LENGTH) return null;
  if (!isPlainRootRelative(value)) return null;

  // The same rules on the decoded form: %2F%2F, %5C and %09 must not become
  // a separator or a control character for whatever decodes the value later.
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!isPlainRootRelative(decoded)) return null;

  let url: URL;
  try {
    url = new URL(value, PARSE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_ORIGIN) return null;

  // The parser has resolved dot segments by now (/d/../account is /account);
  // the decoded pathname covers a router that matches /%61ccount as /account.
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (isReserved(url.pathname) || isReserved(decodedPathname)) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * /account, carrying the return path when there is a safe one: the href of
 * the Like, Bookmark and Fork prompts and the OAuth callbackURL. Validates
 * again, so no caller can build a callback around an unchecked value.
 */
export function accountHref(next?: unknown): string {
  const safe = safeNextPath(next);
  return safe === null ? "/account" : `/account?next=${encodeURIComponent(safe)}`;
}
