/**
 * PUT /api/decks/[id]/cards — replace the deck's full card list (P1.1).
 *
 * Shaped for P1.2's editor: the client keeps the authoritative list in memory,
 * edits optimistically, and a debounced autosave PUTs the whole list. A full
 * replace is idempotent and last-write-wins — no operation log to reconcile,
 * retries are safe, and a 100-card Commander list is a trivially small payload.
 *
 * Zones are validated against the adapter's FormatDef via the registry (the
 * route knows nothing game-specific); card/printing ids are verified against
 * the deck's game before any row is written. The decks-table denorms
 * (leader_ids, ci_mask, updated_at) update in the same transaction.
 *
 * Caching intent: dynamic — a mutation; Cache-Control no-store.
 */
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { findFormatById, gameCodeById } from "@/db/seed-data";
import { cardListIssues, leaderDenorm, type DeckCardInput } from "@/lib/decks/cards";
import { fetchLegalityMap } from "@/lib/decks/legality";
import { requireOwnedDeck } from "@/lib/decks/route-helpers";
import { toDeckSnapshot } from "@/lib/decks/validation";
import { getAdapter } from "@/lib/games/registry";
import type { CardData } from "@/lib/games/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const { decks, deckCards, cardIdentities: ci, cardPrintings: cp } = schema;

const BODY = z.object({
  cards: z
    .array(
      z.object({
        cardId: z.uuid(),
        zone: z.string().min(1).max(40),
        qty: z.number().int().min(1).max(99),
        tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
        printingId: z.uuid().optional(),
      }),
    )
    .max(500),
});

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/cards">) {
  const { id } = await ctx.params;
  const access = await requireOwnedDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const { deck } = access;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const entries: DeckCardInput[] = parsed.data.cards;

  // Resolve the deck's format to the adapter's FormatDef (core ↔ interface only).
  const game = gameCodeById(deck.gameId);
  const adapter = game ? getAdapter(game) : undefined;
  const formatCode = findFormatById(deck.formatId)?.code;
  const formatDef = adapter?.formats.find((f) => f.code === formatCode);
  if (!adapter || !formatDef) {
    return NextResponse.json(
      { error: "Deck has an unknown game/format" },
      { status: 500, headers: NO_STORE },
    );
  }

  const issues = cardListIssues(entries, formatDef);
  if (issues.length > 0) {
    return NextResponse.json(
      { error: "Invalid card list", issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const db = getDb();

  // Every card must exist in this deck's game (soft-removed cards stay valid —
  // decks may reference them). Full CardData is selected so the adapter's
  // validate re-runs server-side on the same shapes the client saw (P1.4).
  const cardIds = [...new Set(entries.map((e) => e.cardId))];
  const cardRows = cardIds.length
    ? await db
        .select({
          id: ci.id,
          name: ci.name,
          primaryType: ci.primaryType,
          costValue: ci.costValue,
          colorsMask: ci.colorsMask,
          ciMask: ci.ciMask,
          isLeaderCandidate: ci.isLeaderCandidate,
          isPreview: ci.isPreview,
          cheapestUsd: ci.cheapestUsd,
          popularity: ci.popularity,
          attrs: ci.attrs,
        })
        .from(ci)
        .where(and(inArray(ci.id, cardIds), eq(ci.gameId, deck.gameId)))
    : [];
  const ciMaskByCard = new Map(cardRows.map((r) => [r.id, r.ciMask]));
  const unknownCards = cardIds.filter((cid) => !ciMaskByCard.has(cid));
  if (unknownCards.length > 0) {
    return NextResponse.json(
      { error: "Unknown card ids for this game", issues: unknownCards },
      { status: 400, headers: NO_STORE },
    );
  }

  // Chosen printings must belong to the card they're attached to.
  const printingPairs = entries.filter((e) => e.printingId);
  if (printingPairs.length > 0) {
    const printingIds = [...new Set(printingPairs.map((e) => e.printingId!))];
    const printingRows = await db
      .select({ id: cp.id, cardIdentityId: cp.cardIdentityId })
      .from(cp)
      .where(inArray(cp.id, printingIds));
    const ownerByPrinting = new Map(printingRows.map((r) => [r.id, r.cardIdentityId]));
    const badPrintings = printingPairs
      .filter((e) => ownerByPrinting.get(e.printingId!) !== e.cardId)
      .map((e) => e.printingId!);
    if (badPrintings.length > 0) {
      return NextResponse.json(
        { error: "Printing ids that don't belong to their card", issues: badPrintings },
        { status: 400, headers: NO_STORE },
      );
    }
  }

  // Authoritative revalidation (P1.4): same pure adapter code the editor runs
  // live. Issues are reported, never a rejection — in-progress decks are
  // legitimately incomplete, and the client already showed the same list.
  const legalityMap = await fetchLegalityMap(deck.formatId, cardIds);
  const cardData = new Map<string, CardData>(
    cardRows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        primaryType: r.primaryType,
        costValue: r.costValue,
        colorsMask: r.colorsMask,
        ciMask: r.ciMask,
        isLeaderCandidate: r.isLeaderCandidate,
        isPreview: r.isPreview,
        cheapestUsd: r.cheapestUsd === null ? null : Number(r.cheapestUsd),
        popularity: r.popularity,
        attrs: r.attrs as Record<string, unknown>,
        legality: legalityMap.get(r.id) ?? [],
      },
    ]),
  );
  const validation = adapter.validate(toDeckSnapshot(adapter.id, formatDef, entries), cardData);

  const { leaderIds, ciMask } = leaderDenorm(entries, formatDef, ciMaskByCard);
  const updatedAt = new Date();

  await db.transaction(async (tx) => {
    await tx.delete(deckCards).where(eq(deckCards.deckId, deck.id));
    if (entries.length > 0) {
      await tx.insert(deckCards).values(
        entries.map((e) => ({
          deckId: deck.id,
          zone: e.zone,
          cardIdentityId: e.cardId,
          quantity: e.qty,
          printingId: e.printingId ?? null,
          tags: e.tags,
        })),
      );
    }
    await tx.update(decks).set({ leaderIds, ciMask, updatedAt }).where(eq(decks.id, deck.id));
  });

  return NextResponse.json(
    { count: entries.length, leaderIds, ciMask, updatedAt, validation },
    { headers: NO_STORE },
  );
}
