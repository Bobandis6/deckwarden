/**
 * POST /api/decks/claim — claim anonymous decks into an account (P1.7
 * plumbing, live since P2.1).
 *
 * The signed-in caller sends every {id, token} pair from its localStorage
 * token store; claim logic (src/lib/decks/claim.ts) attaches user_id and
 * NULLs claim_token for each deck whose token still verifies, and everything
 * else is silently skipped. The client then discards the claimed tokens —
 * ownership is the session from here on, never the token again.
 *
 * Rate limited per IP: the body can probe up to 100 deck ids per call, and
 * nothing about claiming is high-frequency.
 *
 * Caching intent: dynamic — a mutation; never cacheable.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUserId } from "@/lib/auth";
import { clientIp } from "@/lib/decks/access";
import { claimDecks } from "@/lib/decks/claim";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const BODY = z.object({
  decks: z
    .array(z.object({ id: z.uuid(), token: z.string().min(1).max(200) }))
    .min(1)
    .max(100),
});

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(RATE_LIMITS.deckClaim(clientIp(request.headers)));
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

  const userId = await getSessionUserId(request.headers);
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to claim decks" },
      { status: 401, headers: NO_STORE },
    );
  }

  const claimedIds = await claimDecks(userId, parsed.data.decks);
  return NextResponse.json({ claimedIds }, { headers: NO_STORE });
}
