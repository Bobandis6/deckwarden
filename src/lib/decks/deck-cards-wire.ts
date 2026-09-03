/**
 * Server-side deck card-list query (extracted from GET /api/decks/[id] in
 * P1.7 so the share page's RSC and the API route share one implementation).
 *
 * Produces the wire shape the editor and share views consume: one row per
 * deck entry with a full CardWire `card` (CardData + legality exceptions +
 * display image), joined in two queries — no N+1. Image URLs derive from the
 * printing id (build plan §4: never stored); entries without a chosen
 * printing resolve the identity's default printing in one extra query only
 * when needed.
 */
import { and, asc, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { embeddablePrintingImageUrl } from "@/lib/cards/images";
import type { CardWire } from "@/lib/decks/editor-state";
import { fetchLegalityMap } from "@/lib/decks/legality";

const { deckCards: dc, cardIdentities: ci, cardPrintings: cp } = schema;

export interface DeckCardWire {
  cardId: string;
  zone: string;
  qty: number;
  tags: string[];
  printingId: string | null;
  card: CardWire & { legality: NonNullable<CardWire["legality"]> };
}

export async function fetchDeckCardsWire(deck: {
  id: string;
  formatId: number;
}): Promise<DeckCardWire[]> {
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
      colorsMask: ci.colorsMask,
      ciMask: ci.ciMask,
      isLeaderCandidate: ci.isLeaderCandidate,
      isPreview: ci.isPreview,
      cheapestUsd: ci.cheapestUsd,
      popularity: ci.popularity,
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
  const [defaults, legalityMap] = await Promise.all([
    needDefault
      ? db
          .select({
            cardIdentityId: cp.cardIdentityId,
            id: cp.id,
            imageOverride: cp.imageOverride,
          })
          .from(cp)
          .innerJoin(dc, and(eq(dc.deckId, deck.id), eq(dc.cardIdentityId, cp.cardIdentityId)))
          .where(eq(cp.isDefault, true))
      : Promise.resolve([]),
    // Exceptions-only legality for the deck's format (P1.4) — the adapter's
    // validate consumes it client-side; absent = format default.
    fetchLegalityMap(
      deck.formatId,
      rows.map((r) => r.cardId),
    ),
  ]);
  const defaultByCard = new Map(defaults.map((d) => [d.cardIdentityId, d]));

  return rows.map((r) => {
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
        id: r.cardId,
        name: r.name,
        primaryType: r.primaryType,
        costValue: r.costValue,
        colorsMask: r.colorsMask,
        ciMask: r.ciMask,
        isLeaderCandidate: r.isLeaderCandidate,
        isPreview: r.isPreview,
        cheapestUsd: r.cheapestUsd === null ? null : Number(r.cheapestUsd),
        popularity: r.popularity,
        // jsonb comes back `unknown`; ingest writes object attrs by contract.
        attrs: r.attrs as Record<string, unknown>,
        legality: legalityMap.get(r.cardId) ?? [],
        image: printing ? embeddablePrintingImageUrl(printing, "normal") : null,
      },
    };
  });
}
