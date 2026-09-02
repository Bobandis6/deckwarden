/**
 * POST /api/decks/[id]/fork (P3.6) — copy a readable deck into the signed-in
 * user's account with credit (forks.ts has the full semantics).
 *
 * Account-only: 401 signed out (the share page's Fork button links to
 * sign-in instead), then the usual 404/403 read contract — you can fork
 * anything you can read, your own decks included. Limits: per-user fork
 * bucket plus the per-IP deck-create bucket (a fork mints a deck row).
 *
 * 201 {deck} — the new deck's meta (isOwner true); the client opens it in
 * the editor. Caching intent: dynamic mutation, no-store.
 */
import { NextResponse, type NextRequest } from "next/server";

import { clientIp } from "@/lib/decks/access";
import { forkDeck } from "@/lib/decks/forks";
import { requireEngageableDeck } from "@/lib/decks/route-helpers";
import { deckMetaJson } from "@/lib/decks/serialize";
import { VersionCapError } from "@/lib/decks/versions";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/fork">) {
  const { id } = await ctx.params;
  const access = await requireEngageableDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const ip = clientIp(request.headers);
  const limited = await enforceRateLimit([
    ...RATE_LIMITS.deckFork(access.userId),
    ...RATE_LIMITS.deckCreate(ip),
  ]);
  if (limited) return limited;

  try {
    const fork = await forkDeck(access.deck, { userId: access.userId, ip });
    return NextResponse.json(
      { deck: deckMetaJson(fork, { isOwner: true }) },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    // Unreachable for a fresh row (0 versions), kept explicit rather than a 500.
    if (err instanceof VersionCapError) {
      return NextResponse.json({ error: err.message }, { status: 409, headers: NO_STORE });
    }
    throw err;
  }
}
