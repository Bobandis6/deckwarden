/**
 * /api/decks/[id]/versions (P3.6) — the deck's named versions.
 *
 * GET  — list, newest first: version, note, date, card count (no snapshots;
 *        a single version's cards come from /versions/[version]). Plus the
 *        cap so the UI can show "n / 50" honestly.
 * POST — "Save version": freeze the live list under an optional note.
 *        409 at the cap (MAX_VERSIONS_PER_DECK); the message names the fix.
 *
 * Owner-only both ways (claim-token guests included — versions are the
 * owner's working history, never public). Caching intent: force-dynamic +
 * no-store; the output depends on the ownership proof.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { clientIp } from "@/lib/decks/access";
import { requireOwnedDeck } from "@/lib/decks/route-helpers";
import {
  listVersions,
  MAX_VERSION_NOTE_LENGTH,
  MAX_VERSIONS_PER_DECK,
  saveVersion,
  VersionCapError,
} from "@/lib/decks/versions";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/versions">) {
  const { id } = await ctx.params;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const versions = await listVersions(access.deck.id);
  return NextResponse.json(
    {
      versions,
      currentVersion: access.deck.currentVersion,
      cap: MAX_VERSIONS_PER_DECK,
    },
    { headers: NO_STORE },
  );
}

const POST_BODY = z.object({
  note: z.string().trim().max(MAX_VERSION_NOTE_LENGTH).optional(),
});

export async function POST(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/versions">) {
  const { id } = await ctx.params;
  const limited = await enforceRateLimit(
    RATE_LIMITS.deckVersionWrite(clientIp(request.headers), id),
  );
  if (limited) return limited;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;

  let json: unknown = {};
  const raw = await request.text();
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
    }
  }
  const parsed = POST_BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const saved = await saveVersion(access.deck.id, parsed.data.note || null);
    return NextResponse.json(
      { ...saved, cap: MAX_VERSIONS_PER_DECK },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    if (err instanceof VersionCapError) {
      return NextResponse.json(
        { error: err.message, cap: MAX_VERSIONS_PER_DECK },
        { status: 409, headers: NO_STORE },
      );
    }
    throw err;
  }
}
