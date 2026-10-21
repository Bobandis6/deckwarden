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

import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { getSessionUserId } from "@/lib/auth";
import { ownedIdentityIds } from "@/lib/collection/owned";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BODY = z.object({ ids: z.array(z.uuid()).min(1).max(400) });

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) {
    return noStoreJson({ error: "Sign in to check your collection" }, { status: 401 });
  }
  const limited = await enforceRateLimit(RATE_LIMITS.collectionOwned(userId));
  if (limited) return limited;

  const body = await parseJsonBody(request, BODY);
  if (body instanceof NextResponse) return body;

  const owned = await ownedIdentityIds(userId, body.ids);
  return noStoreJson({ owned: [...owned] });
}
