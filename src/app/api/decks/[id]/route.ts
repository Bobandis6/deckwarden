/**
 * /api/decks/[id] — read / update-meta / delete (P1.1).
 *
 * GET    — meta + current card list (joined card basics so P1.2's editor needs
 *          no N+1). Owner always; non-owners only when visibility != private.
 * PATCH  — meta only (name / description / visibility). Owner only.
 * DELETE — hard delete; deck_cards + deck_versions cascade. Owner only.
 *
 * Caching intent: force-dynamic + Cache-Control no-store on every response —
 * output depends on the x-deck-token header (isOwner, private reads), so
 * neither the CDN nor the browser may cache it. Public share pages get their
 * own cacheable SSR route in P1.7; this API stays private.
 */
import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { printingImageUrl } from "@/lib/cards/images";
import { requireOwnedDeck, requireReadableDeck } from "@/lib/decks/route-helpers";
import { deckMetaJson } from "@/lib/decks/serialize";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const { decks, deckCards: dc, cardIdentities: ci, cardPrintings: cp } = schema;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]">) {
  const { id } = await ctx.params;
  const access = await requireReadableDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const { deck, isOwner } = access;

  const db = getDb();
  const rows = await db
    .select({
      cardId: dc.cardIdentityId,
      zone: dc.zone,
      qty: dc.quantity,
      tags: dc.tags,
      printingId: dc.printingId,
      name: ci.name,
      primaryType: ci.primaryType,
      costValue: ci.costValue,
      ciMask: ci.ciMask,
      cheapestUsd: ci.cheapestUsd,
      attrs: ci.attrs,
      chosenImageOverride: cp.imageOverride,
    })
    .from(dc)
    .innerJoin(ci, eq(ci.id, dc.cardIdentityId))
    .leftJoin(cp, eq(cp.id, dc.printingId))
    .where(eq(dc.deckId, deck.id))
    .orderBy(asc(dc.zone), asc(ci.nameNorm));

  // Images for chosen printings derive directly; entries on the default
  // printing resolve it in one extra query only when needed.
  const needDefault = rows.filter((r) => !r.printingId).length > 0;
  const defaults = needDefault
    ? await db
        .select({ cardIdentityId: cp.cardIdentityId, id: cp.id, imageOverride: cp.imageOverride })
        .from(cp)
        .innerJoin(dc, and(eq(dc.deckId, deck.id), eq(dc.cardIdentityId, cp.cardIdentityId)))
        .where(eq(cp.isDefault, true))
    : [];
  const defaultByCard = new Map(defaults.map((d) => [d.cardIdentityId, d]));

  const cards = rows.map((r) => {
    const attrs = r.attrs as Record<string, unknown>;
    const printing = r.printingId
      ? { id: r.printingId, imageOverride: r.chosenImageOverride }
      : (defaultByCard.get(r.cardId) ?? null);
    return {
      cardId: r.cardId,
      zone: r.zone,
      qty: r.qty,
      tags: r.tags,
      printingId: r.printingId,
      card: {
        name: r.name,
        primaryType: r.primaryType,
        costValue: r.costValue,
        ciMask: r.ciMask,
        cheapestUsd: r.cheapestUsd === null ? null : Number(r.cheapestUsd),
        manaCost: typeof attrs["mana_cost"] === "string" ? attrs["mana_cost"] : null,
        typeLine: typeof attrs["type_line"] === "string" ? attrs["type_line"] : null,
        image: printing ? printingImageUrl(printing, "normal") : null,
      },
    };
  });

  return NextResponse.json({ deck: deckMetaJson(deck, { isOwner }), cards }, { headers: NO_STORE });
}

const PATCH_BODY = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(4000).nullable(),
    visibility: z.enum(schema.DECK_VISIBILITIES),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: "No fields to update" });

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/decks/[id]">) {
  const { id } = await ctx.params;
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
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;

  const db = getDb();
  await db.delete(decks).where(eq(decks.id, access.deck.id));
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
