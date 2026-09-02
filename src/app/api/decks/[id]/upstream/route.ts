/**
 * GET /api/decks/[id]/upstream (P3.6) — everything the owner of a fork needs
 * to render "changes since you forked":
 *
 *   credit    — the credit state for this viewer (forks.ts), null when the
 *               deck isn't a fork (pointer NULL — never was, or upstream
 *               deleted, which is the same thing in the data model).
 *   baseline  — the fork's version 1, frozen at fork time (decision 4), or
 *               null if the owner deleted it (the UI says so honestly).
 *   upstream  — the upstream's CURRENT list when this viewer can read it,
 *               else null (private upstream: credit without contents).
 *   names     — cardId -> name for every id in either list.
 *
 * The client runs the pure diff both ways: baseline -> upstream ("what
 * they changed since you forked") and baseline -> your live list ("what you
 * changed"). Owner-only; force-dynamic + no-store.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { getSessionUserId } from "@/lib/auth";
import { deckTokenFrom } from "@/lib/decks/access";
import { forkCredit } from "@/lib/decks/forks";
import { requireOwnedDeck } from "@/lib/decks/route-helpers";
import { cardNamesById, loadLiveFrozen, loadVersion } from "@/lib/decks/versions";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/upstream">) {
  const { id } = await ctx.params;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const { deck } = access;

  const credit = await forkCredit(deck, {
    token: deckTokenFrom(request.headers),
    userId: await getSessionUserId(request.headers),
  });
  if (!credit || !deck.forkedFromDeckId) {
    return NextResponse.json(
      { credit: null, baseline: null, upstream: null, names: {} },
      { headers: NO_STORE },
    );
  }

  const db = getDb();
  const [baselineVersion, upstream] = await Promise.all([
    loadVersion(db, deck.id, 1),
    credit.state === "linked" ? loadLiveFrozen(db, deck.forkedFromDeckId) : Promise.resolve(null),
  ]);
  const baseline = baselineVersion?.cards ?? null;
  const names = await cardNamesById(db, [
    ...(baseline ?? []).map((c) => c.cardId),
    ...(upstream ?? []).map((c) => c.cardId),
  ]);
  return NextResponse.json(
    {
      credit,
      baseline,
      baselineNote: baselineVersion?.note ?? null,
      upstream,
      names,
    },
    { headers: NO_STORE },
  );
}
