/**
 * Set reads (X4a): the released-set list behind GET /api/sets (the /cards
 * Set picker, and X4b's Sets page next), and the one-row status lookup the
 * search route runs when a set scope found nothing.
 */
import { and, asc, desc, eq, exists, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { placeSets, type ReleasedSet } from "@/lib/sets/lines";
import { releasedPaperSet } from "@/lib/sets/sql";

const { cardIdentities: ci, cardPrintings: cp, sets } = schema;

/**
 * Every released paper set of a game that carries a live card, newest first
 * (a day's sets by line — the expansion before its Commander decks — then
 * the larger set, then the name), with its live-card count, its group and
 * its place in its line (`placeSets` — the rules are TypeScript, pinned by
 * lines.test.ts). ONE statement: the live-card count per set is a
 * count(DISTINCT) over the game's live printings whose card is live —
 * ~110k rows, measured 135–145 ms warm (2026-09-28), which is why the route
 * is edge-cached a day. 706 Magic sets that day: 241 main, 465 other.
 */
export async function loadReleasedSets(gameId: number): Promise<ReleasedSet[]> {
  const db = getDb();
  const cards = sql<number>`count(DISTINCT ${cp.cardIdentityId})::int`.as("cards");
  const live = db
    .select({ setId: cp.setId, cards })
    .from(cp)
    .where(
      and(
        eq(cp.gameId, gameId),
        eq(cp.isRemoved, false),
        exists(
          db
            .select({ one: sql`1` })
            .from(ci)
            .where(and(eq(ci.id, cp.cardIdentityId), eq(ci.isRemoved, false))),
        ),
      ),
    )
    .groupBy(cp.setId)
    .as("live");

  const rows = await db
    .select({
      code: sets.code,
      name: sets.name,
      releasedAt: sets.releasedAt,
      setType: sets.setType,
      cards: live.cards,
    })
    .from(sets)
    .innerJoin(live, eq(live.setId, sets.id))
    .where(and(eq(sets.gameId, gameId), releasedPaperSet(sets)))
    .orderBy(desc(sets.releasedAt), desc(live.cards), asc(sets.name));

  return placeSets(
    rows.map((row) => ({
      code: row.code,
      name: row.name,
      // Never NULL here: a NULL date is never released (releasedPaperSet).
      releasedAt: row.releasedAt ?? "",
      setType: row.setType ?? "",
      cards: row.cards,
    })),
  );
}

/** What a set code is, for a scope that found nothing (the route's warning). */
export type SetStatus = "released" | "unreleased" | "digital" | "unknown";

/**
 * One `sets_game_code` probe. "released" means a released paper set — the
 * scope's own definition — so an empty answer for it is honestly empty (the
 * other filters left nothing), and the route adds no warning.
 */
export async function loadSetStatus(gameId: number, code: string): Promise<SetStatus> {
  const [row] = await getDb()
    .select({ digital: sets.digital, released: sql<boolean | null>`${releasedPaperSet(sets)}` })
    .from(sets)
    .where(and(eq(sets.gameId, gameId), eq(sets.code, code)))
    .limit(1);
  if (!row) return "unknown";
  if (row.digital) return "digital";
  return row.released ? "released" : "unreleased";
}
