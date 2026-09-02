/**
 * POST /api/collection/owned — "which of these cards do I own?" (P3.7).
 * The editor's owned badges load with the deck (GET /api/decks/[id] carries
 * the deck's owned ids); cards added mid-session are looked up here, in one
 * debounced batch per settled edit burst, so a badge is never guessed.
 * Session-only: the answer is about the caller's own collection.
 *
 * Caching intent: dynamic mutation-shaped read, no-store.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUserId } from "@/lib/auth";
import { ownedIdentityIds } from "@/lib/collection/owned";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const BODY = z.object({ ids: z.array(z.uuid()).min(1).max(400) });

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to check your collection" },
      { status: 401, headers: NO_STORE },
    );
  }
  const limited = await enforceRateLimit(RATE_LIMITS.collectionOwned(userId));
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const owned = await ownedIdentityIds(userId, parsed.data.ids);
  return NextResponse.json({ owned: [...owned] }, { headers: NO_STORE });
}
