/**
 * GET /api/health — liveness + DB reachability.
 * Caching intent: dynamic (never cached; hits the DB on every call).
 * P0.4 extends this with price-staleness (> 48h) and pg_database_size() checks.
 */
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const [row] = await db.select({ games: sql<number>`count(*)::int` }).from(schema.games);
    return NextResponse.json({ ok: true, db: "up", games: row?.games ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, db: "down", error: message }, { status: 503 });
  }
}
