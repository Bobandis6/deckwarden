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

import { auth, getSessionUserId } from "@/lib/auth";
import { deleteAccount } from "@/lib/profile/delete-account";
import { DELETE_CONFIRM_PHRASE } from "@/lib/profile/delete-account-phrase";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const BODY = z.object({
  confirm: z.literal(DELETE_CONFIRM_PHRASE),
});

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to delete your account" },
      { status: 401, headers: NO_STORE },
    );
  }
  const limited = await enforceRateLimit(RATE_LIMITS.accountDelete(userId));
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
  }
  if (!BODY.safeParse(json).success) {
    return NextResponse.json(
      { error: `Body must be {"confirm": "${DELETE_CONFIRM_PHRASE}"}` },
      { status: 400, headers: NO_STORE },
    );
  }

  const { decksDeleted } = await deleteAccount(userId);

  try {
    await auth.api.signOut({ headers: request.headers });
  } catch {
    // Session row is gone either way; see header comment.
  }

  return NextResponse.json({ deleted: true, decksDeleted }, { headers: NO_STORE });
}
