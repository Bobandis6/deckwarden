/**
 * POST /api/decks/claim — claim anonymous decks into an account (P1.7).
 *
 * Plumbing only until Better Auth lands (P2.1): the route shape and the
 * claim logic (src/lib/decks/claim.ts — attach user_id, NULL claim_token)
 * exist now, but the whole route is gated off behind DECKWARDEN_ENABLE_CLAIM
 * and 404s until then, and without a session there is no user to claim for,
 * so a flagged-on call still stops at 401. P2.1 replaces getSessionUserId
 * with the Better Auth session lookup and flips the flag.
 *
 * Caching intent: dynamic — a mutation; never cacheable.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { claimDecks } from "@/lib/decks/claim";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const BODY = z.object({
  decks: z
    .array(z.object({ id: z.uuid(), token: z.string().min(1).max(200) }))
    .min(1)
    .max(100),
});

/** Better Auth session lookup lands here in P2.1. */
async function getSessionUserId(_request: NextRequest): Promise<string | null> {
  return null;
}

export async function POST(request: NextRequest) {
  if (process.env.DECKWARDEN_ENABLE_CLAIM !== "1") {
    return NextResponse.json(
      { error: "Claiming isn't available yet" },
      { status: 404, headers: NO_STORE },
    );
  }

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

  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to claim decks" },
      { status: 401, headers: NO_STORE },
    );
  }

  const claimedIds = await claimDecks(userId, parsed.data.decks);
  return NextResponse.json({ claimedIds }, { headers: NO_STORE });
}
