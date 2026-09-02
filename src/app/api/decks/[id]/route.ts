/**
 * /api/decks/[id] — read / update-meta / delete (P1.1).
 *
 * GET    — meta + current card list (joined card basics so P1.2's editor needs
 *          no N+1). Owner always; non-owners only when visibility != private.
 * PATCH  — meta only (name / description / visibility / folder). Owner only.
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
import { fetchDeckCardsWire } from "@/lib/decks/deck-cards-wire";
import { clientIp, deckTokenFrom } from "@/lib/decks/access";
import { getSessionUserId } from "@/lib/auth";
import { loadFolder } from "@/lib/decks/folders";
import { deleteDecksForkSafe, forkCredit } from "@/lib/decks/forks";
import { requireOwnedDeck, requireReadableDeck } from "@/lib/decks/route-helpers";
import { deckMetaJson } from "@/lib/decks/serialize";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const { decks } = schema;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]">) {
  const { id } = await ctx.params;
  const access = await requireReadableDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const { deck, isOwner } = access;

  // `card` is CardData-shaped (incl. legality, plus image — the CardWire type
  // in src/lib/decks/editor-state.ts): the editor feeds it straight to the
  // adapter's display/validate/analyze without any game-specific reshaping.
  // Query shared with the P1.7 share page (deck-cards-wire.ts).
  // forkedFrom (P3.6): the credit line, resolved for THIS viewer (a private
  // upstream credits without name/link). One extra query, forks only.
  const [cards, forkedFrom] = await Promise.all([
    fetchDeckCardsWire(deck),
    deck.forkedFromDeckId
      ? forkCredit(deck, {
          token: deckTokenFrom(request.headers),
          userId: await getSessionUserId(request.headers),
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json(
    { deck: { ...deckMetaJson(deck, { isOwner }), forkedFrom }, cards },
    { headers: NO_STORE },
  );
}

const PATCH_BODY = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(4000).nullable(),
    /** P2.7: long-form primer, share-page-only render (never in OG/JSON-LD). */
    notes: z.string().max(20000).nullable(),
    visibility: z.enum(schema.DECK_VISIBILITIES),
    /** P2.2: move into a folder (must be the same user's) or null to unfile. */
    folderId: z.uuid().nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: "No fields to update" });

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/decks/[id]">) {
  const { id } = await ctx.params;
  // Rate limit precedes auth so unauthenticated hammering is bounded too;
  // per-deck generosity covers the name autosave (~1/s debounced).
  const limited = await enforceRateLimit(RATE_LIMITS.deckMetaWrite(clientIp(request.headers), id));
  if (limited) return limited;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = PATCH_BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  // Folder assignment is account-only and same-owner-only: a guest deck has
  // no folders to belong to, and filing into a stranger's folder would leak
  // your deck onto their shared folder page.
  if (parsed.data.folderId != null) {
    if (access.deck.userId === null) {
      return NextResponse.json(
        { error: "Sign in to organize decks into folders" },
        { status: 400, headers: NO_STORE },
      );
    }
    const folder = await loadFolder(parsed.data.folderId);
    if (!folder || folder.userId !== access.deck.userId) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400, headers: NO_STORE });
    }
  }

  const db = getDb();
  const [updated] = await db
    .update(decks)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(decks.id, access.deck.id))
    .returning();

  return NextResponse.json(
    { deck: deckMetaJson(updated, { isOwner: true }) },
    { headers: NO_STORE },
  );
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/decks/[id]">) {
  const { id } = await ctx.params;
  const limited = await enforceRateLimit(RATE_LIMITS.deckMetaWrite(clientIp(request.headers), id));
  if (limited) return limited;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;

  await deleteDecksForkSafe(getDb(), [access.deck.id]);
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
