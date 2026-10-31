/**
 * Anonymous-deck purge policy (P1.1, plan §4): the cost of the guest-deck
 * spam surface. Two rules, both scoped to user_id IS NULL **and kind =
 * 'user'** (W8a: precons are ownerless product rows, not stale guests):
 *   - EMPTY decks (no deck_cards rows) created > 30 days ago
 *   - untouched decks (updated_at) > 12 months ago
 *
 * DRY-RUN BY DEFAULT: candidates are counted; rows are deleted only when
 * PURGE_APPLY=true. The nightly workflow runs it unarmed until a human has
 * eyeballed at least one candidate list and set the PURGE_ANON_DECKS_APPLY
 * repo variable to "true".
 *
 * The report is COUNTS PER REASON (S1, SECURITY-AUDIT-report.md M2): the
 * nightly runs in a public repository, so its log is world-readable, and a
 * private guest deck's name or an unlisted deck's public id must never land
 * there. The per-deck lines (internal id, public id, name) print only with
 * PURGE_VERBOSE=1 — a local eyeballing run, never the workflow.
 *
 * Two steps run whatever the dry-run gate says, because neither deletes a
 * deck: the created_ip clear (S6, SECURITY-AUDIT-report.md L16 — the
 * privacy page says the creating address is cleared after 30 days, and
 * this is the step that does it; created-ip-retention.ts) and the
 * rate-limit counter sweep (P1.8). Both print a count and nothing else.
 *
 *   pnpm decks:purge                    # dry run, counts only
 *   PURGE_VERBOSE=1 pnpm decks:purge    # dry run, one line per candidate (local)
 *   PURGE_APPLY=true pnpm decks:purge   # delete
 */
import { loadEnv } from "../src/lib/load-env";

loadEnv();

import { sql } from "drizzle-orm";

import { createDb } from "../src/db";
import { decks, deckCards, rateLimitCounters } from "../src/db/schema";
import { clearStaleCreatedIps, createdIpReportLine } from "../src/lib/decks/created-ip-retention";
import { deleteDecksForkSafe } from "../src/lib/decks/forks";
import { purgeReportLines, type PurgeReason } from "../src/lib/decks/purge-report";

const EMPTY_AFTER = "30 days";
const UNTOUCHED_AFTER = "12 months";

async function main() {
  const apply = process.env.PURGE_APPLY === "true";
  const verbose = process.env.PURGE_VERBOSE === "1";
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
        reason: sql<PurgeReason>`case
          when ${decks.updatedAt} < now() - interval '${sql.raw(UNTOUCHED_AFTER)}' then 'untouched'
          else 'empty'
        end`,
      })
      .from(decks)
      .where(
        // kind = 'user' (W8a): precons are ownerless BY DESIGN and never
        // "touched" — without this guard every precon becomes a candidate
        // 12 months after its release date.
        sql`${decks.userId} is null and ${decks.kind} = 'user' and (
          ${decks.updatedAt} < now() - interval '${sql.raw(UNTOUCHED_AFTER)}'
          or (
            ${decks.createdAt} < now() - interval '${sql.raw(EMPTY_AFTER)}'
            and not exists (select 1 from ${deckCards} where ${deckCards.deckId} = ${decks.id})
          )
        )`,
      );

    for (const line of purgeReportLines(candidates, {
      apply,
      verbose,
      emptyAfter: EMPTY_AFTER,
      untouchedAfter: UNTOUCHED_AFTER,
    })) {
      console.log(line);
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

    // created_ip retention (S6, L16): the creating address is spam control
    // at creation time and nothing after; cleared 30 days on, every deck
    // alike. Always applied — a nulled column is not a deleted deck.
    console.log(createdIpReportLine(await clearStaleCreatedIps(db)));

    // Rate-limit counter sweep (P1.8): windows are ≤1 day, so anything older
    // than 2 days is dead weight, and Better Auth's `auth:` rows live in
    // 10-second windows, so an hour is already dead weight for them (the
    // 2026-10-30 security audit's counters record: those rows were the
    // unbounded ones, and the sweep was their only eviction). Always applied —
    // counters are not user data. The driver's count, never RETURNING: the
    // sweep must stay cheap however many rows a flood left behind.
    const sweptAuth = await db
      .delete(rateLimitCounters)
      .where(
        sql`${rateLimitCounters.key} like 'auth:%' and ${rateLimitCounters.windowStart} < now() - interval '1 hour'`,
      );
    const swept = await db
      .delete(rateLimitCounters)
      .where(sql`${rateLimitCounters.windowStart} < now() - interval '2 days'`);
    console.log(
      `rate-limit sweep: ${sweptAuth.count} stale auth row(s) and ${swept.count} other stale row(s) deleted.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
