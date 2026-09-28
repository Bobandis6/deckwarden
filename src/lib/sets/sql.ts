/**
 * The set rules as SQL (X4a, WAVE3.md A and D4) — pure fragment builders, no
 * IO: the search translator's set scope, the search route's in-set printing
 * and `loadReleasedSets` all read them, so the picker can never offer a set
 * the scope refuses, and the printing a tile shows is the one the `number`
 * sort ranks it by.
 */
import { and, eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias, QueryBuilder, type AnyPgColumn } from "drizzle-orm/pg-core";

import { cardPrintings, sets } from "@/db/schema";

/**
 * "Released" (WAVE3.md A): the set's own date is today or earlier in UTC,
 * and the set is not digital-only — never `is_preview` (202 of the 655
 * preview-flagged cards have a released printing). Pinned to UTC in the
 * SQL, not the session: Neon's session zone is GMT, a VPS's may not be. A
 * NULL date is never released. D4's third leg — at least one live card —
 * holds by construction where it matters: the scope needs a live printing,
 * and the list counts live cards.
 */
export function releasedPaperSet(set: { digital: AnyPgColumn; releasedAt: AnyPgColumn }): SQL {
  return sql`(NOT ${set.digital} AND ${set.releasedAt} <= (now() AT TIME ZONE 'UTC')::date)`;
}

/**
 * THE collector-number order (X4a): the lowest leading integer first,
 * numbers with no leading digit last, then the full text, then the printing
 * id — so "2" < "2s" < "10" < "A1", and no two printings tie. 16 % of live
 * Magic printings are not plain digits (9,689 digits then a suffix, 7,630
 * with no leading digit, 2026-09-28); the longest leading run is 6 digits,
 * and `numeric` takes any length. One definition, two uses: which of a
 * card's printings in the set it shows (the lowest), and `sort=number`
 * (cards by that printing).
 */
export function collectorNumberOrder(collectorNumber: SQLWrapper, printingId: SQLWrapper): SQL[] {
  return [
    sql`(substring(${collectorNumber} from '^[0-9]+'))::numeric ASC NULLS LAST`,
    sql`${collectorNumber} ASC`,
    sql`${printingId} ASC`,
  ];
}

const inSetPrinting = alias(cardPrintings, "in_set_printing");
const inSetRow = alias(sets, "in_set_row");

/**
 * Each card's printing in one released set — one row per card, the lowest
 * collector number (`DISTINCT ON` over `collectorNumberOrder`). Driven from
 * the set: one `sets_game_code` probe and one `cp_by_set` scan, then a sort
 * of the set's printings (measured warm 2026-09-28: Bloomburrow 2.9 ms,
 * Secret Lair Drop 17 ms, The List's 5,584 printings 34 ms). A per-card
 * LATERAL pick was measured and refused: its probe ANDs a bitmap of the
 * whole set for every card (Secret Lair Drop 280 ms).
 *
 * The search route LEFT JOINs it on the card id: the translator's EXISTS
 * decides which cards are listed, this only decides which printing each
 * one shows — both read the same set, the same "released" and the same
 * live-printing test, so every listed card finds its row.
 */
export function inSetPrintings(gameId: number, code: string) {
  return new QueryBuilder()
    .selectDistinctOn([inSetPrinting.cardIdentityId], {
      cardIdentityId: inSetPrinting.cardIdentityId,
      id: inSetPrinting.id,
      imageOverride: inSetPrinting.imageOverride,
      collectorNumber: inSetPrinting.collectorNumber,
    })
    .from(inSetPrinting)
    .innerJoin(inSetRow, eq(inSetRow.id, inSetPrinting.setId))
    .where(
      and(
        eq(inSetRow.gameId, gameId),
        eq(inSetRow.code, code),
        releasedPaperSet(inSetRow),
        eq(inSetPrinting.isRemoved, false),
      ),
    )
    .orderBy(
      inSetPrinting.cardIdentityId,
      ...collectorNumberOrder(inSetPrinting.collectorNumber, inSetPrinting.id),
    )
    .as("in_set");
}
