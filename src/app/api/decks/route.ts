/**
 * POST /api/decks — create a deck (P1.1).
 *
 * Guest building is server-side anonymous decks (§4): user_id NULL, a
 * claim_token minted here and returned EXACTLY ONCE (top-level in this
 * response, held in the visitor's localStorage, redeemed at first OAuth in
 * P2.1), created_ip recorded for the anon spam/purge policy.
 *
 * Caching intent: dynamic — a mutation; responses are per-caller and never
 * cacheable (Cache-Control: no-store).
 *
 * Anti-abuse (P1.8): strict per-IP rate limit (checked before body parsing so
 * malformed spam consumes quota), plus a honeypot — the real client sends
 * `website: ""`; anything non-empty is a bot auto-filling the payload and gets
 * a fake 201 (nothing persisted) to waste its time.
 */
import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { findFormat, GAME_ID } from "@/db/seed-data";
import { clientIp } from "@/lib/decks/access";
import { newPublicId } from "@/lib/decks/public-id";
import { deckMetaJson } from "@/lib/decks/serialize";
import { getAdapter } from "@/lib/games/registry";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BODY = z.object({
  game: z.enum(["mtg", "optcg"]),
  format: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  // Default unlisted (P1.7, per plan Appendix A): share links work out of the
  // box; unlisted decks are reachable only via the unguessable public_id.
  visibility: z.enum(schema.DECK_VISIBILITIES).default("unlisted"),
  /** Honeypot — must be absent or empty; the real client sends "". */
  website: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  const limited = await enforceRateLimit(RATE_LIMITS.deckCreate(ip));
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { game, format, name, description, visibility, website } = parsed.data;

  if (website) {
    console.warn("deck-create honeypot tripped", { ip });
    // Fake success: nothing persisted, the ids lead nowhere.
    return NextResponse.json(
      { deck: { id: randomUUID() }, claimToken: randomUUID() },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  }

  // The format must exist both as a seeded DB row (FK) and in the adapter.
  const formatRow = findFormat(game, format);
  const formatDef = getAdapter(game).formats.find((f) => f.code === format);
  if (!formatRow || !formatDef) {
    return NextResponse.json(
      { error: `Unknown format "${format}" for game "${game}"` },
      { status: 400 },
    );
  }

  const claimToken = randomUUID();
  const db = getDb();
  const [deck] = await db
    .insert(schema.decks)
    .values({
      publicId: newPublicId(),
      gameId: GAME_ID[game],
      formatId: formatRow.id,
      userId: null,
      claimToken,
      createdIp: ip,
      ...(name ? { name } : {}),
      description: description ?? null,
      visibility,
    })
    .returning();

  return NextResponse.json(
    { deck: deckMetaJson(deck, { isOwner: true }), claimToken },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
