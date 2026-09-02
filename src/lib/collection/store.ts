/**
 * Collection writes (P3.7): the import transaction and the wipe.
 *
 * Import semantics (decision 4): MERGE is the default and SETS quantities
 * per (printing, finish) — re-importing a fresh export must not double
 * count, and a user's export is the truth about what they hold. REPLACE
 * wipes first, offered as an explicit checkbox for "this file is my whole
 * collection now". Both are ONE transaction; the user row is locked
 * (SELECT ... FOR UPDATE) so two concurrent imports can't race past the cap.
 * Inserts go in 2k-row VALUES chunks (fine on Postgres, small enough per
 * statement); `xmax = 0` on RETURNING distinguishes inserted from updated.
 *
 * Resolution (resolve.ts) runs before the transaction — reads only — and
 * the pure planner (plan.ts) decides finishes, folds duplicates and applies
 * the cap; every adjustment comes back as a count in the report.
 *
 * MTG only for now: the two supported exports are MTG apps. A One Piece
 * importer (M4) would pass its game id through the same functions.
 */
import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { collectionSummary } from "./owned";
import { pickFinish, planImport, writeKey, type PlannedWrite } from "./plan";
import { resolveCollectionRows } from "./resolve";
import {
  COLLECTION_LIMITS,
  type CollectionRow,
  type ImportMode,
  type ImportReport,
  type ResolvedBy,
  type UnresolvedRow,
} from "./types";

const { collections, users } = schema;

const INSERT_CHUNK = 2000;

export async function importCollection(
  userId: string,
  rows: readonly CollectionRow[],
  mode: ImportMode,
): Promise<ImportReport> {
  const db = getDb();
  const gameId = GAME_ID.mtg;
  const { resolved, unresolved } = await resolveCollectionRows(db, gameId, rows);

  const resolvedBy: Record<ResolvedBy, number> = { scryfallId: 0, setNumber: 0, name: 0 };
  let finishAdjusted = 0;
  const planned: PlannedWrite[] = resolved.map((r) => {
    resolvedBy[r.by]++;
    const { finish, adjusted } = pickFinish(rows[r.index].finish, r.finishes);
    if (adjusted) finishAdjusted++;
    return { printingId: r.printingId, finish, quantity: rows[r.index].quantity };
  });

  const unresolvedRows: UnresolvedRow[] = unresolved
    .slice(0, COLLECTION_LIMITS.unresolvedEcho)
    .map(({ index, reason }) => {
      const row = rows[index];
      return {
        index,
        name: row.name,
        ...(row.scryfallId ? { scryfallId: row.scryfallId } : {}),
        ...(row.setCode ? { setCode: row.setCode } : {}),
        ...(row.collectorNumber ? { collectorNumber: row.collectorNumber } : {}),
        reason,
      };
    });

  return db.transaction(async (tx) => {
    // Serialize imports per user: the cap check below reads the table.
    await tx.execute(sql`select 1 from ${users} where ${users.id} = ${userId} for update`);

    const held = await tx
      .select({ printingId: collections.printingId, finish: collections.finish })
      .from(collections)
      .where(eq(collections.userId, userId));
    const existingKeys = new Set(held.map(writeKey));

    const plan = planImport(planned, existingKeys, mode);

    let deleted = 0;
    if (mode === "replace") {
      const gone = await tx
        .delete(collections)
        .where(eq(collections.userId, userId))
        .returning({ printingId: collections.printingId });
      deleted = gone.length;
    }

    let inserted = 0;
    let updated = 0;
    const now = new Date();
    for (let i = 0; i < plan.writes.length; i += INSERT_CHUNK) {
      const chunk = plan.writes.slice(i, i + INSERT_CHUNK);
      const written = await tx
        .insert(collections)
        .values(chunk.map((w) => ({ userId, ...w, updatedAt: now })))
        .onConflictDoUpdate({
          target: [collections.userId, collections.printingId, collections.finish],
          set: { quantity: sql`excluded.quantity`, updatedAt: now },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const w of written) {
        if (w.inserted) inserted++;
        else updated++;
      }
    }

    return {
      mode,
      received: rows.length,
      resolved: resolved.length,
      resolvedBy,
      unresolvedTotal: unresolved.length,
      unresolved: unresolvedRows,
      finishAdjusted,
      merged: plan.merged,
      inserted,
      updated,
      deleted,
      capped: plan.capped,
      summary: await collectionSummary(userId, tx),
    };
  });
}

/** DELETE /api/collection — every row the user holds. Returns the count. */
export async function wipeCollection(userId: string): Promise<number> {
  const gone = await getDb()
    .delete(collections)
    .where(eq(collections.userId, userId))
    .returning({ printingId: collections.printingId });
  return gone.length;
}
