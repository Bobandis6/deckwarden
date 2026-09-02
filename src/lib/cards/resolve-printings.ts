/**
 * Printing resolution by (set code, collector number) (P3.7). Moxfield
 * exports carry no Scryfall ids — their key is Edition + Collector Number —
 * and ManaBox rows whose id doesn't resolve fall back to the same key. This
 * is the half of the LATER.md "setHint-aware import resolution" row that
 * fires here; it is a shared function on purpose so the paste importer's
 * `setHint` ("(SET) 123", parsed since P1.6 and ignored by /api/cards/
 * resolve) can adopt it later — recorded in LATER.md, not widened into
 * this package.
 *
 * Exact match only: set codes are stored lowercase (Scryfall's), collector
 * numbers as printed ("741z", "252s", "M21-246"). (set, number) is unique
 * across card_printings (verified 2026-09-02: zero duplicates), so a hit is
 * THE printing. Served by cp_by_set (set_id, collector_number) through a
 * VALUES join — one round trip per 1,000 keys, never a per-row query.
 */
import { sql } from "drizzle-orm";

import { schema, type DbExecutor } from "@/db";

const { cardPrintings, sets } = schema;

export interface PrintingRef {
  printingId: string;
  identityId: string;
  finishes: string[];
}

export interface SetNumberKey {
  setCode: string;
  collectorNumber: string;
}

/** Map key for a (set code, collector number) pair — lowercased set, number as printed. */
export function setNumberKey(setCode: string, collectorNumber: string): string {
  return `${setCode.trim().toLowerCase()}#${collectorNumber.trim()}`;
}

const CHUNK = 1000;

export async function resolvePrintingsBySetNumber(
  db: DbExecutor,
  gameId: number,
  keys: readonly SetNumberKey[],
): Promise<Map<string, PrintingRef>> {
  const found = new Map<string, PrintingRef>();
  const distinct = [
    ...new Map(
      keys.map((k) => [
        setNumberKey(k.setCode, k.collectorNumber),
        { setCode: k.setCode.trim().toLowerCase(), collectorNumber: k.collectorNumber.trim() },
      ]),
    ).values(),
  ].filter((k) => k.setCode && k.collectorNumber);
  for (let i = 0; i < distinct.length; i += CHUNK) {
    const chunk = distinct.slice(i, i + CHUNK);
    const values = sql.join(
      chunk.map((k) => sql`(${k.setCode}::text, ${k.collectorNumber}::text)`),
      sql`, `,
    );
    const rows = (await db.execute(sql`
      select p.id as printing_id, p.card_identity_id as identity_id, p.finishes,
             v.code as set_code, v.cn as collector_number
      from (values ${values}) as v(code, cn)
      join ${sets} s on s.game_id = ${gameId} and s.code = v.code
      join ${cardPrintings} p on p.set_id = s.id and p.collector_number = v.cn
    `)) as unknown as {
      printing_id: string;
      identity_id: string;
      finishes: string[];
      set_code: string;
      collector_number: string;
    }[];
    for (const r of rows) {
      found.set(setNumberKey(r.set_code, r.collector_number), {
        printingId: r.printing_id,
        identityId: r.identity_id,
        finishes: r.finishes ?? [],
      });
    }
  }
  return found;
}
