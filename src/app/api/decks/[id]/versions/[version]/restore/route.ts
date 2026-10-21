/**
 * POST /api/decks/[id]/versions/[version]/restore (P3.6) — make the deck's
 * live list equal a frozen version. One transaction (versions.ts): the
 * current list is saved first as a safety version ("Before restoring vN"),
 * then deck_cards is replaced and the denorms recomputed through the same
 * writer the editor's autosave uses. Response discloses what the resolver
 * had to do (printings reset to default, identities dropped) so the UI can
 * say so instead of restoring silently-different.
 *
 * 404 unknown version · 409 at the version cap (the safety snapshot needs a
 * slot) · 422 if the frozen list no longer fits the format's zones.
 * Owner-only; force-dynamic + no-store.
 */
import { NextResponse, type NextRequest } from "next/server";

import { noStoreJson } from "@/lib/api/json";
import { deckFormat, requireOwnedDeckWrite } from "@/lib/decks/route-helpers";
import { MAX_VERSIONS_PER_DECK, parseVersionParam, restoreVersion } from "@/lib/decks/versions";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/versions/[version]/restore">,
) {
  const { id, version: rawVersion } = await ctx.params;
  const version = parseVersionParam(rawVersion);
  if (version === null) {
    return noStoreJson({ error: "Version not found" }, { status: 404 });
  }
  // IP bucket, ownership proof, per-deck bucket (S4, M1).
  const access = await requireOwnedDeckWrite(request.headers, id, RATE_LIMITS.deckVersionWrite);
  if (access instanceof NextResponse) return access;

  const resolved = deckFormat(access.deck);
  if (!resolved) {
    return noStoreJson({ error: "Deck has an unknown game/format" }, { status: 500 });
  }

  const result = await restoreVersion(access.deck, version, resolved.format);
  if (!result.ok) {
    switch (result.error) {
      case "not_found":
        return noStoreJson({ error: "Version not found" }, { status: 404 });
      case "cap":
        return noStoreJson(
          {
            error: `Restoring saves a safety version first, and this deck already has ${MAX_VERSIONS_PER_DECK}. Delete an old version, then restore.`,
            cap: MAX_VERSIONS_PER_DECK,
          },
          { status: 409 },
        );
      case "invalid":
        return noStoreJson(
          { error: "This version no longer fits the format", issues: result.issues },
          { status: 422 },
        );
    }
  }
  return noStoreJson(result);
}
