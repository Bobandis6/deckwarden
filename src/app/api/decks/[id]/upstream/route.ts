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
import { noStoreJson } from "@/lib/api/json";
import { deckTokenFrom } from "@/lib/decks/access";
import { forkCredit } from "@/lib/decks/forks";
import { requireOwnedDeck } from "@/lib/decks/route-helpers";
import { cardNamesById, loadLiveFrozen, loadVersion } from "@/lib/decks/versions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/upstream">) {
  const { id } = await ctx.params;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const { deck, userId } = access;

  const credit = await forkCredit(deck, { token: deckTokenFrom(request.headers), userId });
  if (!credit || !deck.forkedFromDeckId) {
    return noStoreJson({ credit: null, baseline: null, upstream: null, names: {} });
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
  return noStoreJson({
    credit,
    baseline,
    baselineNote: baselineVersion?.note ?? null,
    upstream,
    names,
  });
}
