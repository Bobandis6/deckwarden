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
 * (leader_ids, ci_mask, updated_at) update in the same transaction, via
 * src/lib/decks/save-cards.ts — shared with version restore (P3.6).
 *
 * The write takes the deck row lock first (S4, SECURITY-AUDIT-report.md L7),
 * like every other writer of the list — restore, fork, the journal: a restore
 * racing an autosave used to be able to commit a merged list (each writer's
 * delete sees only committed rows, so the second insert lands beside the
 * first's) or fail on the primary key; under the lock the later writer waits
 * and replaces the earlier one's list whole.
 *
 * Limiter order (S4, M1): the IP bucket, the ownership proof, then the
 * per-deck bucket — requireOwnedDeckWrite; the per-deck allowance is the
 * owner's alone now.
 *
 * Caching intent: dynamic — a mutation; Cache-Control no-store.
 */
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { findFormatById, gameCodeById } from "@/db/seed-data";
import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { cardListIssues, type DeckCardInput } from "@/lib/decks/cards";
import { fetchLegalityMap } from "@/lib/decks/legality";
import { requireOwnedDeckWrite } from "@/lib/decks/route-helpers";
import { writeDeckCards } from "@/lib/decks/save-cards";
import { toDeckSnapshot, toWireIssues } from "@/lib/decks/validation";
import { lockDeck } from "@/lib/decks/versions";
import { getAdapter } from "@/lib/games/registry";
import { RATE_LIMITS } from "@/lib/rate-limit";
import type { CardData } from "@/lib/games/types";

export const dynamic = "force-dynamic";

const { cardIdentities: ci, cardPrintings: cp } = schema;

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
  // The IP bucket precedes auth, the per-deck one follows it (S4, M1); the
  // per-deck cap is generous — the autosave PUTs at most ~1/s debounced, far
  // under it (P1.8 gate: never throttle the editor).
  const access = await requireOwnedDeckWrite(request.headers, id, RATE_LIMITS.deckCardsPut);
  if (access instanceof NextResponse) return access;
  const { deck } = access;

  const body = await parseJsonBody(request, BODY);
  if (body instanceof NextResponse) return body;
  const entries: DeckCardInput[] = body.cards;

  // Resolve the deck's format to the adapter's FormatDef (core ↔ interface only).
  const game = gameCodeById(deck.gameId);
  const adapter = game ? getAdapter(game) : undefined;
  const formatCode = findFormatById(deck.formatId)?.code;
  const formatDef = adapter?.formats.find((f) => f.code === formatCode);
  if (!adapter || !formatDef) {
    return noStoreJson({ error: "Deck has an unknown game/format" }, { status: 500 });
  }

  const issues = cardListIssues(entries, formatDef);
  if (issues.length > 0) {
    return noStoreJson({ error: "Invalid card list", issues }, { status: 400 });
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
          externalKey: ci.externalKey,
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
    return noStoreJson(
      { error: "Unknown card ids for this game", issues: unknownCards },
      { status: 400 },
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
      return noStoreJson(
        { error: "Printing ids that don't belong to their card", issues: badPrintings },
        { status: 400 },
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
        externalKey: r.externalKey,
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
  // toWireIssues (Y2a): the client-side progress flag never rides this wire.
  const validation = toWireIssues(
    adapter.validate(toDeckSnapshot(adapter.id, formatDef, entries), cardData),
  );

  // The write + denorms live in save-cards.ts (P3.6): version restore
  // replaces the list through the very same function. The deck row lock
  // first (S4, L7): a restore, fork or game log in flight finishes before
  // this list lands, and this list lands whole.
  const { leaderIds, ciMask, updatedAt } = await db.transaction(async (tx) => {
    await lockDeck(tx, deck.id);
    return writeDeckCards(tx, deck.id, entries, formatDef, ciMaskByCard);
  });

  return noStoreJson({ count: entries.length, leaderIds, ciMask, updatedAt, validation });
}
