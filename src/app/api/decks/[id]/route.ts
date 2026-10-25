/**
 * /api/decks/[id] — read / update-meta / delete (P1.1).
 *
 * GET    — meta + current card list (joined card basics so P1.2's editor needs
 *          no N+1). Owner always; non-owners only when visibility != private.
 *          Plus (P3.7) `owned`: the ids among THIS deck's cards that the
 *          signed-in requester owns any printing of, and `hasCollection` —
 *          the editor's owned badges and "you own N/100" line. Session-only
 *          data: the guest-token path returns [] / false.
 * PATCH  — meta (name / description / notes / visibility / folder) and, Y4b,
 *          `goals` — the whole goals object, null clears, its target range
 *          and question keys off the deck's adapter (One Piece takes no
 *          target). Owner only. updated_at moves only when a key other than
 *          goals is present: a target or an answer must not reorder the
 *          "recent" rails (home, /account) — WAVE4 D5.
 *          TOKEN-FILL: `hiddenTokens` — the derived tokens the owner hid,
 *          the whole array (null or [] clears), the same rule: a setting,
 *          never an edit, so it moves updated_at no more than goals do.
 * DELETE — hard delete; deck_cards + deck_versions cascade. Owner only.
 *          Fork-safe (P3.6, fired LATER row): forks' upstream pointers are
 *          NULLed in the same transaction — the self-FK has no ON DELETE.
 *
 * Caching intent: force-dynamic + Cache-Control no-store on every response —
 * output depends on the x-deck-token header (isOwner, private reads), so
 * neither the CDN nor the browser may cache it. Share pages (P1.7, /d/[publicId])
 * render server-side off the same query via deck-cards-wire.ts; this API stays
 * the token-authed surface.
 */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { NO_STORE, noStoreJson, parseJsonBody } from "@/lib/api/json";
import { fetchDeckCardsWire } from "@/lib/decks/deck-cards-wire";
import { deckTokenFrom } from "@/lib/decks/access";
import { deckOwnedForViewer } from "@/lib/collection/owned";
import { loadFolder } from "@/lib/decks/folders";
import { deleteDecksForkSafe, forkCredit } from "@/lib/decks/forks";
import { goalsSchema, normalizeGoals, type DeckGoals } from "@/lib/decks/goals";
import { hiddenTokensSchema, normalizeHiddenTokens } from "@/lib/decks/token-fill";
import { deckFormat, requireOwnedDeckWrite, requireReadableDeck } from "@/lib/decks/route-helpers";
import { deckMetaJson } from "@/lib/decks/serialize";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const { decks } = schema;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]">) {
  const { id } = await ctx.params;
  const access = await requireReadableDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const { deck, isOwner, userId } = access;

  // `card` is CardData-shaped (incl. legality, plus image — the CardWire type
  // in src/lib/decks/editor-state.ts): the editor feeds it straight to the
  // adapter's display/validate/analyze without any game-specific reshaping.
  // Query shared with the P1.7 share page (deck-cards-wire.ts).
  // forkedFrom (P3.6): the credit line, resolved for THIS viewer (a private
  // upstream credits without name/link). One extra query, forks only.
  const [cards, forkedFrom] = await Promise.all([
    fetchDeckCardsWire(deck),
    deck.forkedFromDeckId
      ? forkCredit(deck, { token: deckTokenFrom(request.headers), userId })
      : Promise.resolve(null),
  ]);
  // Owned badges (P3.7): the requester's own collection against this deck's
  // cards — one LIMIT 1 + one deck-sized join for signed-in users, nothing
  // for guests.
  const { owned, hasCollection } = await deckOwnedForViewer(
    userId,
    cards.map((c) => c.cardId),
  );

  return noStoreJson({
    deck: { ...deckMetaJson(deck, { isOwner }), forkedFrom },
    cards,
    owned,
    hasCollection,
  });
}

/** The PATCH body for one deck — goals checked against its game's `brackets` (Y4b). */
function patchBody(brackets: Parameters<typeof goalsSchema>[0]) {
  return z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().max(4000).nullable(),
      /** P2.7: long-form primer, share-page-only render (never in OG/JSON-LD). */
      notes: z.string().max(20000).nullable(),
      visibility: z.enum(schema.DECK_VISIBILITIES),
      /** P2.2: move into a folder (must be the same user's) or null to unfile. */
      folderId: z.uuid().nullable(),
      /** Y4b: the deck's goals, whole — null clears. Never bumps updated_at. */
      goals: goalsSchema(brackets).nullable(),
      /** TOKEN-FILL: the derived tokens the owner hid, whole — null or [] clears. Never bumps updated_at. */
      hiddenTokens: hiddenTokensSchema.nullable(),
    })
    .partial()
    .refine((b) => Object.keys(b).length > 0, { message: "No fields to update" });
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/decks/[id]">) {
  const { id } = await ctx.params;
  // The IP bucket precedes auth so unauthenticated hammering is bounded too;
  // the per-deck bucket follows the ownership proof (S4, M1), and its
  // generosity covers the name autosave (~1/s debounced).
  const access = await requireOwnedDeckWrite(request.headers, id, RATE_LIMITS.deckMetaWrite);
  if (access instanceof NextResponse) return access;

  const body = await parseJsonBody(request, patchBody(deckFormat(access.deck)?.adapter.brackets));
  if (body instanceof NextResponse) return body;

  // Folder assignment is account-only and same-owner-only: a guest deck has
  // no folders to belong to, and filing into a stranger's folder would leak
  // your deck onto their shared folder page.
  if (body.folderId != null) {
    if (access.deck.userId === null) {
      return noStoreJson({ error: "Sign in to organize decks into folders" }, { status: 400 });
    }
    const folder = await loadFolder(body.folderId);
    if (!folder || folder.userId !== access.deck.userId) {
      return noStoreJson({ error: "Folder not found" }, { status: 400 });
    }
  }

  // Goals and hidden tokens are settings, not edits: a body of theirs alone
  // leaves updated_at (and so the deck's place in every "recent" order) alone.
  const { goals, hiddenTokens, ...meta } = body;
  const db = getDb();
  const [updated] = await db
    .update(decks)
    .set({
      ...meta,
      ...(goals !== undefined ? { goals: normalizeGoals(goals as DeckGoals | null) } : {}),
      ...(hiddenTokens !== undefined ? { hiddenTokens: normalizeHiddenTokens(hiddenTokens) } : {}),
      ...(Object.keys(meta).length > 0 ? { updatedAt: new Date() } : {}),
    })
    .where(eq(decks.id, access.deck.id))
    .returning();

  return noStoreJson({ deck: deckMetaJson(updated, { isOwner: true }) });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/decks/[id]">) {
  const { id } = await ctx.params;
  // Authoritative (S3): the session is read from the database, not the
  // 5-minute cookie cache — a session revoked elsewhere cannot delete a deck.
  // Limiter order per S4 (M1): IP bucket, proof, per-deck bucket.
  const access = await requireOwnedDeckWrite(request.headers, id, RATE_LIMITS.deckMetaWrite, {
    authoritative: true,
  });
  if (access instanceof NextResponse) return access;

  await deleteDecksForkSafe(getDb(), [access.deck.id]);
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
