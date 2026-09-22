/**
 * CardWire loading by identity id (W9a extraction from the resolve route,
 * where the select/shape pair lived since P1.6). One projection + one
 * shaping function so the resolve route's passes and id-first loaders
 * (`loadCardWires`, the autofill route) can never drift apart.
 *
 * `fetchDeckCardsWire` (deck-entry-shaped, chosen-printing aware) is a
 * sibling, not a consumer — it stays in src/lib/decks/deck-cards-wire.ts.
 */
import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { embeddablePrintingImageUrl } from "@/lib/cards/images";
import type { CardWire } from "@/lib/decks/editor-state";
import { fetchLegalityMap } from "@/lib/decks/legality";
import type { LegalityEntry } from "@/lib/games/types";

const { cardIdentities: ci, cardPrintings: cp } = schema;

/** CardWire columns + default-printing join, shared by all resolve passes. */
export function wireSelect(db: ReturnType<typeof getDb>) {
  return db
    .select({
      id: ci.id,
      name: ci.name,
      nameNorm: ci.nameNorm,
      externalKey: ci.externalKey,
      primaryType: ci.primaryType,
      costValue: ci.costValue,
      colorsMask: ci.colorsMask,
      ciMask: ci.ciMask,
      cheapestUsd: ci.cheapestUsd,
      popularity: ci.popularity,
      isLeaderCandidate: ci.isLeaderCandidate,
      isPreview: ci.isPreview,
      attrs: ci.attrs,
      printingId: cp.id,
      imageOverride: cp.imageOverride,
    })
    .from(ci)
    .leftJoin(cp, and(eq(cp.cardIdentityId, ci.id), eq(cp.isDefault, true)))
    .$dynamic();
}

export type WireRow = Awaited<ReturnType<typeof wireSelect>>[number];

export function toWire(
  row: WireRow,
  legality: Map<string, LegalityEntry[]>,
): CardWire & { legality: LegalityEntry[] } {
  const { nameNorm: _nameNorm, printingId, imageOverride, cheapestUsd, ...card } = row;
  return {
    ...card,
    attrs: card.attrs as Record<string, unknown>,
    cheapestUsd: cheapestUsd === null ? null : Number(cheapestUsd),
    legality: legality.get(row.id) ?? [],
    image: printingId
      ? embeddablePrintingImageUrl({ id: printingId, imageOverride }, "normal")
      : null,
  };
}

/**
 * Full CardWires (legality included) for a set of identity ids — the W9a
 * autofill response's card payload. Two statements: the wire join and the
 * format's legality exceptions.
 */
export async function loadCardWires(
  ids: readonly string[],
  formatId: number,
): Promise<(CardWire & { legality: LegalityEntry[] })[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await wireSelect(getDb()).where(inArray(ci.id, unique));
  const legality = await fetchLegalityMap(formatId, unique);
  return rows.map((r) => toWire(r, legality));
}
