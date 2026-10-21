/**
 * DELETE /api/account — self-serve account deletion (P2.8; until now the
 * privacy page routed this through GitHub issues).
 *
 * Session-only. The body's confirm literal restates the UI's type-to-confirm
 * ceremony at the API layer so a stray scripted DELETE (or a replayed
 * request from a hostile page) can't wipe an account with a bare call. The
 * deletion itself is one transaction (delete-account.ts): likes recount →
 * decks → user row.
 *
 * Afterwards the session cookie is cleared via better-auth's signOut, best
 * effort: the session row is already gone (cascade), so if signOut throws
 * the cookie simply dangles — cookieCache means at most 5 minutes of
 * phantom "signed in" on checks that skip the DB, and every DB-backed read
 * comes back empty. Not worth a hard failure after the account is gone.
 *
 * Caching intent: dynamic mutation, no-store.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { auth, getSessionUserId } from "@/lib/auth";
import { deleteAccount } from "@/lib/profile/delete-account";
import { DELETE_CONFIRM_PHRASE } from "@/lib/profile/delete-account-phrase";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BODY = z.object({
  confirm: z.literal(DELETE_CONFIRM_PHRASE),
});

export async function DELETE(request: NextRequest) {
  // Authoritative (S3): the session is read from the database, not the
  // 5-minute cookie cache — a session revoked elsewhere cannot delete an account.
  const userId = await getSessionUserId(request.headers, { authoritative: true });
  if (!userId) {
    return noStoreJson({ error: "Sign in to delete your account" }, { status: 401 });
  }
  const limited = await enforceRateLimit(RATE_LIMITS.accountDelete(userId));
  if (limited) return limited;

  const body = await parseJsonBody(request, BODY, {
    invalidError: `Body must be {"confirm": "${DELETE_CONFIRM_PHRASE}"}`,
    maxIssues: 0,
  });
  if (body instanceof NextResponse) return body;

  const { decksDeleted } = await deleteAccount(userId);

  try {
    await auth.api.signOut({ headers: request.headers });
  } catch {
    // Session row is gone either way; see header comment.
  }

  return noStoreJson({ deleted: true, decksDeleted });
}
