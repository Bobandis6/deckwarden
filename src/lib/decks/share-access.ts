/**
 * Who may read a deck's share page (S6, SECURITY-AUDIT-report.md L4),
 * decided once and read twice: by the segment layout, whose `notFound()`
 * runs above the loading boundary and so answers a real 404, and by the
 * page, which renders what the decision allows.
 *
 * Before S6 the page answered 200 for every private deck and handed the
 * client gate the deck's internal uuid, so a private deck's share link was
 * an existence oracle (200 against the 404 an unknown id gets) and a uuid
 * dispenser. Now:
 *   render    — public and unlisted decks for everyone, and a private
 *               ACCOUNT deck for the session that owns it (the proof is the
 *               cookie, which the server can read, so the page renders it
 *               server-side like any other deck).
 *   gate      — a private GUEST deck: the proof is the claim token in the
 *               owning browser's localStorage, which only that browser can
 *               present, so the server hands the public id (never the uuid)
 *               to the client gate and the token-authed API decides.
 *   not-found — a private account deck for anyone else: the same 404 an
 *               unknown id gets, so the link no longer says the deck exists.
 * Pure: the callers resolve the session user id and pass it in.
 */

export type ShareAccess = "render" | "gate" | "not-found";

export function shareAccess(
  deck: { visibility: "public" | "unlisted" | "private"; userId: string | null },
  sessionUserId: string | null,
): ShareAccess {
  if (deck.visibility !== "private") return "render";
  if (deck.userId === null) return "gate";
  return sessionUserId !== null && sessionUserId === deck.userId ? "render" : "not-found";
}
