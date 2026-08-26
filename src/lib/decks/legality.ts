/**
 * Core-side legality fetch (P1.4): the exceptions-only rows the adapter
 * contract expects on CardData.legality — pre-filtered to one format, current
 * rows only (effective_to IS NULL; dated `asOf` evaluation is a later need).
 * Conditional rows pass through untouched; only the game adapter interprets
 * conditions (types.ts LegalityEntry).
 */
import { and, inArray, isNull, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type { LegalityEntry } from "@/lib/games/types";

const { legalities } = schema;

/** Map of cardId → current legality exceptions for one format. Absent = format default. */
export async function fetchLegalityMap(
  formatId: number,
  cardIds: readonly string[],
): Promise<Map<string, LegalityEntry[]>> {
  const map = new Map<string, LegalityEntry[]>();
  if (cardIds.length === 0) return map;

  const rows = await getDb()
    .select({
      cardIdentityId: legalities.cardIdentityId,
      status: legalities.status,
      condition: legalities.condition,
    })
    .from(legalities)
    .where(
      and(
        eq(legalities.formatId, formatId),
        inArray(legalities.cardIdentityId, [...new Set(cardIds)]),
        isNull(legalities.effectiveTo),
      ),
    );

  for (const row of rows) {
    const entry: LegalityEntry = {
      status: row.status,
      ...(row.condition ? { condition: row.condition as LegalityEntry["condition"] } : {}),
    };
    const list = map.get(row.cardIdentityId);
    if (list) list.push(entry);
    else map.set(row.cardIdentityId, [entry]);
  }
  return map;
}
