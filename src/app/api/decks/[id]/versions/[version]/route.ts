/**
 * /api/decks/[id]/versions/[version] (P3.6) — one frozen snapshot.
 *
 * GET    — the version's cards in the frozen shape plus a cardId -> name map
 *          for every id in it, so the client can run the pure diff
 *          (src/lib/decks/diff.ts) against the live list and render names
 *          for cards no longer in the deck.
 * DELETE — remove the version. Version numbers are never reused (the
 *          counter is decks.current_version), so a gap is expected.
 *
 * Owner-only; force-dynamic + no-store.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { clientIp } from "@/lib/decks/access";
import { requireOwnedDeck } from "@/lib/decks/route-helpers";
import { cardNamesById, deleteVersion, loadVersion, parseVersionParam } from "@/lib/decks/versions";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/versions/[version]">,
) {
  const { id, version: rawVersion } = await ctx.params;
  const version = parseVersionParam(rawVersion);
  if (version === null) {
    return NextResponse.json({ error: "Version not found" }, { status: 404, headers: NO_STORE });
  }
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;

  const db = getDb();
  const detail = await loadVersion(db, access.deck.id, version);
  if (!detail) {
    return NextResponse.json({ error: "Version not found" }, { status: 404, headers: NO_STORE });
  }
  const names = await cardNamesById(
    db,
    detail.cards.map((c) => c.cardId),
  );
  return NextResponse.json({ ...detail, names }, { headers: NO_STORE });
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/versions/[version]">,
) {
  const { id, version: rawVersion } = await ctx.params;
  const version = parseVersionParam(rawVersion);
  if (version === null) {
    return NextResponse.json({ error: "Version not found" }, { status: 404, headers: NO_STORE });
  }
  const limited = await enforceRateLimit(
    RATE_LIMITS.deckVersionWrite(clientIp(request.headers), id),
  );
  if (limited) return limited;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;

  const deleted = await deleteVersion(access.deck.id, version);
  if (!deleted) {
    return NextResponse.json({ error: "Version not found" }, { status: 404, headers: NO_STORE });
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
