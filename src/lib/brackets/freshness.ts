/**
 * The bracket read's freshness (Y3b, WAVE4 D4) — core IO, game-agnostic: the
 * adapter names the ingest sources its evidence comes from
 * (`brackets.freshnessSources`) and reads their stats in a pure function
 * (`brackets.freshness`); this module only loads each source's latest
 * successful run. "A failing source never lowers the read": a feed the
 * adapter judges missing, stale or switched off makes its factor read
 * "Couldn't check".
 *
 * Caching intent: none here — callers decide (Y4a's facts route answers with
 * the combo facts under its own Cache-Control). One statement per call.
 */
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema, type DbExecutor } from "@/db";
import type { BracketFreshness, GameAdapter, IngestRunFacts } from "@/lib/games/types";

const { ingestRuns } = schema;

/**
 * Each named source's latest successful ingest run — ONE statement (DISTINCT
 * ON over ingest_runs_source_started's (source, started_at DESC) order). A
 * source with no successful run is simply absent.
 */
export async function loadLatestRuns(
  sources: readonly string[],
  db: DbExecutor = getDb(),
): Promise<IngestRunFacts[]> {
  if (sources.length === 0) return [];
  const rows = await db
    .selectDistinctOn([ingestRuns.source], {
      source: ingestRuns.source,
      id: ingestRuns.id,
      startedAt: ingestRuns.startedAt,
      stats: ingestRuns.stats,
    })
    .from(ingestRuns)
    .where(and(inArray(ingestRuns.source, [...sources]), eq(ingestRuns.status, "succeeded")))
    .orderBy(ingestRuns.source, desc(ingestRuns.startedAt));
  return rows.map((r) => ({
    source: r.source,
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    stats: r.stats,
  }));
}

/** The read's freshness for one game, as of `now`; null when the game declares no brackets. */
export async function loadBracketFreshness(
  adapter: GameAdapter,
  db: DbExecutor = getDb(),
  now: Date = new Date(),
): Promise<BracketFreshness | null> {
  const brackets = adapter.brackets;
  if (!brackets) return null;
  const runs = await loadLatestRuns(brackets.freshnessSources, db);
  return brackets.freshness(runs, now.toISOString());
}
