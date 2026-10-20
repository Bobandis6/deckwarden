/**
 * What `/get-session` and `/list-sessions` hand to the browser (S3,
 * SECURITY-AUDIT-report.md L9). Stock Better Auth returns the session ROW:
 * `token` — the bearer the httpOnly cookie exists to keep away from script —
 * plus `ipAddress` and `userAgent`; `/list-sessions` returns every active
 * session's token. The header reads `user.name`, `image`, `avatar` and
 * `username` and nothing from `session` at all, so the three fields leave
 * the payload here, in a `hooks.after`: the pipeline every router and
 * `auth.api.*` call goes through (`dist/api/dispatch.mjs` — the hook's return
 * replaces `ctx.context.returned`). `session.id`, `userId`, `expiresAt`,
 * `createdAt` and `updatedAt` stay. Server code never read the three either
 * (grep), and the library's own endpoints read the session through
 * `getSessionFromCtx`, a direct call that skips hooks, so sign-out, revoke
 * and the cookie cache are untouched. Its own module so a throwaway instance
 * can mount the same hook (session-payload.test.ts).
 */
import type { BetterAuthOptions } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

/** Never in a session payload the browser can read. */
export const STRIPPED_SESSION_FIELDS: readonly string[] = ["token", "ipAddress", "userAgent"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripSession(session: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(session).filter(([key]) => !STRIPPED_SESSION_FIELDS.includes(key)),
  );
}

/**
 * The replacement payload for a path, or undefined when the response is left
 * alone (another path, a signed-out null, an error).
 */
export function stripSessionPayload(path: string, returned: unknown): unknown {
  if (path === "/get-session") {
    if (!isRecord(returned) || !isRecord(returned.session)) return undefined;
    return { ...returned, session: stripSession(returned.session) };
  }
  if (path === "/list-sessions" && Array.isArray(returned)) {
    return returned.map((session) => (isRecord(session) ? stripSession(session) : session));
  }
  return undefined;
}

export const SESSION_PAYLOAD_HOOKS = {
  after: createAuthMiddleware(async (ctx) => {
    const stripped = stripSessionPayload(ctx.path, ctx.context.returned);
    if (stripped !== undefined) return ctx.json(stripped);
  }),
} satisfies NonNullable<BetterAuthOptions["hooks"]>;
