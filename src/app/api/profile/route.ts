/**
 * PATCH /api/profile — choose or change the profile username (P2.2).
 *
 * Session-only (401 signed out): usernames belong to accounts, and picking
 * one is the explicit opt-in that makes name/avatar publicly browsable at
 * /u/[username]. Changing is allowed (the old URL just 404s — no redirect
 * table at this size); the tight per-user rate limit keeps that from being
 * a squatting tool. Uniqueness is the DB constraint, not a pre-check:
 * TOCTOU-free, and 23505 maps to a friendly 409.
 *
 * Caching intent: dynamic mutation, no-store.
 */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { getSessionUserId } from "@/lib/auth";
import { checkUsername, USERNAME_MAX } from "@/lib/profile/username";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BODY = z.object({
  // Length is validated for real (post-fold) in checkUsername; this bound
  // just keeps garbage payloads from reaching it.
  username: z.string().max(USERNAME_MAX * 4),
});

export async function PATCH(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) {
    return noStoreJson({ error: "Sign in to choose a username" }, { status: 401 });
  }
  const limited = await enforceRateLimit(RATE_LIMITS.profileWrite(userId));
  if (limited) return limited;

  const body = await parseJsonBody(request, BODY);
  if (body instanceof NextResponse) return body;

  const checked = checkUsername(body.username);
  if (!checked.ok) {
    return noStoreJson({ error: checked.error }, { status: 400 });
  }

  try {
    await getDb()
      .update(schema.users)
      .set({ username: checked.username, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return noStoreJson({ error: "That username is taken." }, { status: 409 });
    }
    throw err;
  }

  return noStoreJson({ username: checked.username });
}
