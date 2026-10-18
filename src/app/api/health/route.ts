/**
 * GET /api/health — liveness + database reachability, nothing else.
 * Caching intent: dynamic (never cached; one `select 1` on every call).
 *
 * `{ ok: true, db: "up" }` (200) or `{ ok: false, db: "down", error }` (503)
 * with a fixed message: the driver's text (host, database, the failure)
 * goes to the server log, never to the public (S1, SECURITY-AUDIT-report.md
 * L3). The free-tier gauges this route carried until S1 — database size,
 * price age — were readable by anyone, uncached and unlimited, and
 * duplicated the nightly's own alert channels: `pnpm db:size` fails the run
 * over 350 MB, and a Scryfall ingest that fails is a red nightly, so prices
 * cannot go stale quietly.
 */
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: "up" });
  } catch (err) {
    console.error("[health] database check failed", err);
    return NextResponse.json(
      { ok: false, db: "down", error: "database unreachable" },
      { status: 503 },
    );
  }
}
