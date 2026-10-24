/**
 * /api/decks/[id]/versions (P3.6) — the deck's named versions.
 *
 * GET  — list, newest first: version, note, kind, date, card count (no
 *        snapshots; a single version's cards come from /versions/[version]).
 *        Plus the cap so the UI can show "n / 50" honestly — it counts
 *        `saved` versions only (Y9a); `played` snapshots have their own
 *        allowance, sent beside it. Y10: each version's `record` — the
 *        games played with it, won / lost / drawn (null when none; History's
 *        "Played 3 · 2–1"), from the journal's one grouped count — and
 *        `latestListHash`, the newest version's playable-list hash, so the
 *        dialog can hash the screen and say "No card changes since vN" (a
 *        version from before the hash is hashed here, never stamped — a GET
 *        writes nothing).
 * POST — "Save version": freeze the live list under an optional note.
 *        409 at the cap (MAX_VERSIONS_PER_DECK); the message names the fix.
 *
 * Owner-only both ways (claim-token guests included — versions are the
 * owner's working history, never public). Caching intent: force-dynamic +
 * no-store; the output depends on the ownership proof.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { LIST_HASH_PREFIX, playableListHash } from "@/lib/decks/list-hash";
import { playableZoneIds } from "@/lib/decks/playable";
import { deckFormat, requireOwnedDeck, requireOwnedDeckWrite } from "@/lib/decks/route-helpers";
import {
  listVersions,
  loadVersion,
  MAX_PLAYED_SNAPSHOTS_PER_DECK,
  MAX_VERSION_NOTE_LENGTH,
  MAX_VERSIONS_PER_DECK,
  saveVersion,
  VersionCapError,
} from "@/lib/decks/versions";
import { loadRecordCells } from "@/lib/journal/games";
import { tallyByVersion } from "@/lib/journal/record";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** The zones a version's "N cards" counts (DECK-TOKENS: the playable list, never Tokens). */
function countedZoneIds(deck: { gameId: number; formatId: number }): string[] | undefined {
  const fmt = deckFormat(deck);
  return fmt ? playableZoneIds(fmt.format) : undefined;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/versions">) {
  const { id } = await ctx.params;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const [versions, cells] = await Promise.all([
    listVersions(access.deck.id, countedZoneIds(access.deck)),
    loadRecordCells(getDb(), access.deck.id),
  ]);
  const tallies = tallyByVersion(cells);
  const newest = versions[0];
  let latestListHash = newest?.listHash ?? null;
  if (newest && !latestListHash?.startsWith(LIST_HASH_PREFIX)) {
    const detail = await loadVersion(getDb(), access.deck.id, newest.version);
    latestListHash = detail ? playableListHash(detail.cards) : null;
  }
  return noStoreJson({
    versions: versions.map((v) => ({
      version: v.version,
      note: v.note,
      kind: v.kind,
      createdAt: v.createdAt,
      cardCount: v.cardCount,
      record: tallies.get(v.version) ?? null,
    })),
    currentVersion: access.deck.currentVersion,
    cap: MAX_VERSIONS_PER_DECK,
    playedAllowance: MAX_PLAYED_SNAPSHOTS_PER_DECK,
    latestListHash,
  });
}

const POST_BODY = z.object({
  note: z.string().trim().max(MAX_VERSION_NOTE_LENGTH).optional(),
});

export async function POST(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/versions">) {
  const { id } = await ctx.params;
  // IP bucket, ownership proof, per-deck bucket (S4, M1).
  const access = await requireOwnedDeckWrite(request.headers, id, RATE_LIMITS.deckVersionWrite);
  if (access instanceof NextResponse) return access;

  // An empty body is a plain save (the editor sends none); anything present must be JSON.
  const body = await parseJsonBody(request, POST_BODY, { emptyBody: {} });
  if (body instanceof NextResponse) return body;

  try {
    const saved = await saveVersion(access.deck.id, body.note || null, countedZoneIds(access.deck));
    return noStoreJson({ ...saved, cap: MAX_VERSIONS_PER_DECK }, { status: 201 });
  } catch (err) {
    if (err instanceof VersionCapError) {
      return noStoreJson({ error: err.message, cap: MAX_VERSIONS_PER_DECK }, { status: 409 });
    }
    throw err;
  }
}
