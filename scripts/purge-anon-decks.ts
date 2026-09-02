/**
 * Anonymous-deck purge policy (P1.1, plan §4): the cost of the guest-deck
 * spam surface. Two rules, both scoped to user_id IS NULL:
 *   - EMPTY decks (no deck_cards rows) created > 30 days ago
 *   - untouched decks (updated_at) > 12 months ago
 *
 * DRY-RUN BY DEFAULT: candidates are logged; rows are deleted only when
 * PURGE_APPLY=true. The nightly workflow runs it unarmed until a human has
 * eyeballed at least one candidate log and set the PURGE_ANON_DECKS_APPLY
 * repo variable to "true".
 *
 *   pnpm decks:purge                  # dry run
 *   PURGE_APPLY=true pnpm decks:purge # delete
 */
import { config as loadEnv } from "dotenv";

// Next.js convention: .env.local overrides .env (first file in the list wins).
loadEnv({ path: [".env.local", ".env"], quiet: true });

import { sql } from "drizzle-orm";

import { createDb } from "../src/db";
import { decks, deckCards, rateLimitCounters } from "../src/db/schema";
import { deleteDecksForkSafe } from "../src/lib/decks/forks";

const EMPTY_AFTER = "30 days";
const UNTOUCHED_AFTER = "12 months";

async function main() {
  const apply = process.env.PURGE_APPLY === "true";
  const { client, db } = createDb();
  try {
    const candidates = await db
      .select({
        id: decks.id,
        publicId: decks.publicId,
        name: decks.name,
        createdAt: decks.createdAt,
        updatedAt: decks.updatedAt,
        cardRows: sql<number>`(select count(*) from ${deckCards} where ${deckCards.deckId} = ${decks.id})::int`,
        reason: sql<string>`case
          when ${decks.updatedAt} < now() - interval '${sql.raw(UNTOUCHED_AFTER)}' then 'untouched > ${sql.raw(UNTOUCHED_AFTER)}'
          else 'empty > ${sql.raw(EMPTY_AFTER)}'
        end`,
      })
      .from(decks)
      .where(
        sql`${decks.userId} is null and (
          ${decks.updatedAt} < now() - interval '${sql.raw(UNTOUCHED_AFTER)}'
          or (
            ${decks.createdAt} < now() - interval '${sql.raw(EMPTY_AFTER)}'
            and not exists (select 1 from ${deckCards} where ${deckCards.deckId} = ${decks.id})
          )
        )`,
      );

    console.log(
      `purge-anon-decks: ${candidates.length} candidate(s) [empty > ${EMPTY_AFTER}, untouched > ${UNTOUCHED_AFTER}] — mode: ${apply ? "APPLY" : "dry-run"}`,
    );
    for (const c of candidates) {
      console.log(
        `  ${c.id}  ${c.publicId}  "${c.name}"  cards=${c.cardRows}  created=${c.createdAt.toISOString()}  updated=${c.updatedAt.toISOString()}  (${c.reason})`,
      );
    }

    if (apply && candidates.length > 0) {
      // Fork-safe (P3.6): a purged guest deck may be someone's upstream —
      // their pointer is NULLed in the same transaction (self-FK, no ON DELETE).
      const deleted = await deleteDecksForkSafe(
        db,
        candidates.map((c) => c.id),
      );
      console.log(`deleted ${deleted} deck(s) (deck_cards/deck_versions cascade; forks detached).`);
    } else if (candidates.length > 0) {
      console.log("dry run — nothing deleted. Set PURGE_APPLY=true to delete.");
    }

    // Rate-limit counter sweep (P1.8): windows are ≤1 day, so anything older
    // than 2 days is dead weight. Always applied — counters are not user data.
    const sweep = await db
      .delete(rateLimitCounters)
      .where(sql`${rateLimitCounters.windowStart} < now() - interval '2 days'`)
      .returning({ key: rateLimitCounters.key });
    console.log(`rate-limit sweep: ${sweep.length} stale counter row(s) deleted.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
