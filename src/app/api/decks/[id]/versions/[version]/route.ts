/**
 * /api/decks/[id]/versions/[version] (P3.6) — one frozen snapshot.
 *
 * GET    — the version's cards in the frozen shape plus a cardId -> name map
 *          for every id in it, so the client can run the pure diff
 *          (src/lib/decks/diff.ts) against the live list and render names
 *          for cards no longer in the deck.
 * DELETE — remove the version. Version numbers are never reused (the
 *          counter is decks.current_version), so a gap is expected. 409
 *          when a logged game was played with it (Y9a) — the game keeps
 *          its exact list, so the version stays while the game does.
 *
 * Owner-only; force-dynamic + no-store.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getDb } from "@/db";
import { NO_STORE, noStoreJson } from "@/lib/api/json";
import { requireOwnedDeck, requireOwnedDeckWrite } from "@/lib/decks/route-helpers";
import { cardNamesById, deleteVersion, loadVersion, parseVersionParam } from "@/lib/decks/versions";
import { JOURNAL_COPY } from "@/lib/journal/copy";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/versions/[version]">,
) {
  const { id, version: rawVersion } = await ctx.params;
  const version = parseVersionParam(rawVersion);
  if (version === null) {
    return noStoreJson({ error: "Version not found" }, { status: 404 });
  }
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;

  const db = getDb();
  const detail = await loadVersion(db, access.deck.id, version);
  if (!detail) {
    return noStoreJson({ error: "Version not found" }, { status: 404 });
  }
  const names = await cardNamesById(
    db,
    detail.cards.map((c) => c.cardId),
  );
  return noStoreJson({ ...detail, names });
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/versions/[version]">,
) {
  const { id, version: rawVersion } = await ctx.params;
  const version = parseVersionParam(rawVersion);
  if (version === null) {
    return noStoreJson({ error: "Version not found" }, { status: 404 });
  }
  // IP bucket, ownership proof, per-deck bucket (S4, M1).
  const access = await requireOwnedDeckWrite(request.headers, id, RATE_LIMITS.deckVersionWrite);
  if (access instanceof NextResponse) return access;

  const deleted = await deleteVersion(access.deck.id, version);
  if (deleted === "not_found") {
    return noStoreJson({ error: "Version not found" }, { status: 404 });
  }
  if (deleted === "in_use") {
    return noStoreJson({ error: JOURNAL_COPY.versionInUse }, { status: 409 });
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
