/**
 * Session minting for the smokes that need a signed-in user (S9,
 * SECURITY-AUDIT-report.md L19, I8): one copy of what six scripts each
 * carried. Sessions cannot come from OAuth in a script, so a throwaway user
 * and a session row are inserted straight into the database `DATABASE_URL`
 * names, and the cookie is signed the way Better Auth reads it
 * (`src/lib/smoke/session-cookie.ts`, pinned against Web Crypto's HMAC in
 * its test).
 *
 * Importing this module imports the host guard, so a script that mints a
 * session is refused against a non-local `BASE_URL` even if it forgot the
 * guard. Nothing here prints: the secret and the tokens never reach a log,
 * and the only error thrown names the missing variable, not a value.
 *
 * The six copies agreed on everything but the label in the throwaway user's
 * name and address, which is the caller's `label` here (`P22` → "P22 Smoke a
 * <run>", `p22-smoke-a-<run>@smoke.invalid`). The user id is handed to the
 * caller's cleanup list BEFORE the session row is written, the order every
 * copy kept, so a failed session insert still leaves the user where the
 * `finally` can delete it. Each script keeps its own checks and cleanup; only
 * the minting lives here.
 */
import "./guard";

import { randomBytes } from "node:crypto";

import type { Sql } from "postgres";

import { signedSessionCookie } from "../../src/lib/smoke/session-cookie";

export interface MintedSession {
  /** The users row's id. */
  id: string;
  /** The `Cookie` header value that signs the user in. */
  cookie: string;
}

/** Read after dotenv has loaded — never at import time, which runs before it. */
function smokeSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set — see .env.example.");
  return secret;
}

/**
 * Insert a throwaway user and a one-hour session for it; the user id lands in
 * `userIds` before the session row is written.
 */
export async function mintSession(
  sql: Sql,
  opts: { label: string; tag: string; run: string; userIds: string[] },
): Promise<MintedSession> {
  const secret = smokeSecret();
  const { label, tag, run } = opts;
  const [user] = await sql`
    insert into users (name, email) values
      (${`${label} Smoke ${tag} ${run}`}, ${`${label.toLowerCase()}-smoke-${tag}-${run}@smoke.invalid`})
    returning id`;
  const id = user.id as string;
  opts.userIds.push(id);
  const token = randomBytes(24).toString("hex");
  await sql`
    insert into sessions (token, user_id, expires_at)
    values (${token}, ${id}, now() + interval '1 hour')`;
  return { id, cookie: signedSessionCookie(token, secret) };
}
