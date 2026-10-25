/**
 * POST /api/decks — create a deck (P1.1; session-aware since P2.1).
 *
 * Guest building is server-side anonymous decks (§4): user_id NULL, a
 * claim_token minted here and returned EXACTLY ONCE (top-level in this
 * response, held in the visitor's localStorage, redeemed at first OAuth),
 * created_ip recorded for the anon spam/purge policy. Signed-in creates skip
 * the token entirely — user_id is set at birth and claimToken comes back
 * null; the session is the ownership proof.
 *
 * Caching intent: dynamic — a mutation; responses are per-caller and never
 * cacheable (Cache-Control: no-store).
 *
 * Goals (Y4b, WAVE4 D5): a draft whose first real edit is a target or an
 * answer carries its goals in the create, as a seeded name does — one
 * request, no PATCH after it. Checked against the game's `brackets` (One
 * Piece takes no target); absent or null = none.
 *
 * Precon lineage (PRECON-OWNED): a draft seeded by "Start from this
 * precon" sends `fromPrecon`, the precon's slug, with its first create
 * whatever edit mints it; the server resolves it through precon_products
 * (one indexed read), refuses an unknown slug or one of another game or
 * format (400, nothing inserted) and stores the precon's deck id. It also
 * takes `ownsPrecon` when the draft was answered before it minted;
 * `ownsPrecon` without `fromPrecon` is a 400 (an answer needs a precon).
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
import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { getSessionUserId } from "@/lib/auth";
import { clientIp } from "@/lib/decks/access";
import { goalsSchema, normalizeGoals, type DeckGoals } from "@/lib/decks/goals";
import { PRECON_SLUG_RE } from "@/lib/decks/precon-info";
import { ownsPreconSchema } from "@/lib/decks/precon-owned";
import { loadPreconBySlug } from "@/lib/decks/precons";
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
  /** Y4b: checked below against the game's adapter, once `game` is known. */
  goals: z.unknown().optional(),
  /** PRECON-OWNED: the precon the draft was seeded from, by its slug. */
  fromPrecon: z.string().regex(PRECON_SLUG_RE).optional(),
  /** PRECON-OWNED: the draft's answer, when it came before the mint; null = not asked. */
  ownsPrecon: ownsPreconSchema.optional(),
});

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  const limited = await enforceRateLimit(RATE_LIMITS.deckCreate(ip));
  if (limited) return limited;

  const body = await parseJsonBody(request, BODY);
  if (body instanceof NextResponse) return body;
  const { game, format, name, description, visibility, website, goals, fromPrecon, ownsPrecon } =
    body;

  if (website) {
    console.warn("deck-create honeypot tripped", { ip });
    // Fake success: nothing persisted, the ids lead nowhere.
    return noStoreJson({ deck: { id: randomUUID() }, claimToken: randomUUID() }, { status: 201 });
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

  let deckGoals: DeckGoals | null = null;
  if (goals !== undefined && goals !== null) {
    const checked = goalsSchema(getAdapter(game).brackets).safeParse(goals);
    if (!checked.success) {
      return NextResponse.json(
        { error: "Invalid goals", issues: checked.error.issues },
        { status: 400 },
      );
    }
    deckGoals = normalizeGoals(checked.data as DeckGoals);
  }

  // The precon lineage (PRECON-OWNED): a real precon of this game and format, or nothing.
  if (fromPrecon === undefined && ownsPrecon !== undefined && ownsPrecon !== null) {
    return noStoreJson({ error: "An answer needs the precon it answers" }, { status: 400 });
  }
  let preconDeckId: string | null = null;
  if (fromPrecon !== undefined) {
    const found = await loadPreconBySlug(fromPrecon);
    if (!found) return noStoreJson({ error: "Unknown precon" }, { status: 400 });
    if (found.deck.gameId !== GAME_ID[game] || found.deck.formatId !== formatRow.id) {
      return noStoreJson({ error: "That precon is for another game or format" }, { status: 400 });
    }
    preconDeckId = found.deck.id;
  }

  const userId = await getSessionUserId(request.headers);
  const claimToken = userId ? null : randomUUID();
  const db = getDb();
  const [deck] = await db
    .insert(schema.decks)
    .values({
      publicId: newPublicId(),
      gameId: GAME_ID[game],
      formatId: formatRow.id,
      userId,
      claimToken,
      createdIp: ip,
      ...(name ? { name } : {}),
      description: description ?? null,
      visibility,
      ...(deckGoals ? { goals: deckGoals } : {}),
      ...(preconDeckId ? { preconDeckId, ...(ownsPrecon != null ? { ownsPrecon } : {}) } : {}),
    })
    .returning();

  return noStoreJson({ deck: deckMetaJson(deck, { isOwner: true }), claimToken }, { status: 201 });
}
