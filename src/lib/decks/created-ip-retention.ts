/**
 * decks.created_ip retention (S6, SECURITY-AUDIT-report.md L16). The
 * creating address is recorded on EVERY deck — guest, account and fork
 * alike (decks/route.ts, forks.ts) — for spam control and abuse cleanup at
 * creation time, and nothing reads it afterwards; until S6 nothing cleared
 * it either, while the privacy page described it as spam control for
 * anonymous decks. The page now says the address is cleared 30 days after
 * the deck is created, and the nightly purge (scripts/purge-anon-decks.ts)
 * runs this to make that true: one UPDATE, counted, always applied (the
 * deck purge's dry-run gate does not cover it — nulling a column is not a
 * deletion), the count alone in the public log (S1).
 */
import { sql } from "drizzle-orm";

import type { DbExecutor } from "@/db";
import { decks } from "@/db/schema";

/** The SQL interval text; the privacy page states the same number. */
export const CREATED_IP_RETENTION = "30 days";

/** NULLs created_ip on every deck created more than CREATED_IP_RETENTION ago; returns how many. */
export async function clearStaleCreatedIps(db: DbExecutor): Promise<number> {
  const cleared = await db
    .update(decks)
    .set({ createdIp: null })
    .where(
      sql`${decks.createdIp} is not null and ${decks.createdAt} < now() - interval '${sql.raw(CREATED_IP_RETENTION)}'`,
    )
    .returning({ id: decks.id });
  return cleared.length;
}

/** The one line the nightly prints for it: a count, never an address or an id. */
export function createdIpReportLine(cleared: number): string {
  return `created_ip: cleared on ${cleared} deck(s) created more than ${CREATED_IP_RETENTION} ago.`;
}
