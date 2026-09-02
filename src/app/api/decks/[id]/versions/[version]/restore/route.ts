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

import { clientIp } from "@/lib/decks/access";
import { deckFormat, requireOwnedDeck } from "@/lib/decks/route-helpers";
import { MAX_VERSIONS_PER_DECK, parseVersionParam, restoreVersion } from "@/lib/decks/versions";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/versions/[version]/restore">,
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

  const resolved = deckFormat(access.deck);
  if (!resolved) {
    return NextResponse.json(
      { error: "Deck has an unknown game/format" },
      { status: 500, headers: NO_STORE },
    );
  }

  const result = await restoreVersion(access.deck, version, resolved.format);
  if (!result.ok) {
    switch (result.error) {
      case "not_found":
        return NextResponse.json(
          { error: "Version not found" },
          { status: 404, headers: NO_STORE },
        );
      case "cap":
        return NextResponse.json(
          {
            error: `Restoring saves a safety version first, and this deck already has ${MAX_VERSIONS_PER_DECK} — delete an old version, then restore.`,
            cap: MAX_VERSIONS_PER_DECK,
          },
          { status: 409, headers: NO_STORE },
        );
      case "invalid":
        return NextResponse.json(
          { error: "This version no longer fits the format", issues: result.issues },
          { status: 422, headers: NO_STORE },
        );
    }
  }
  return NextResponse.json(result, { headers: NO_STORE });
}
