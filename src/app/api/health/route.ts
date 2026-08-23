/**
 * GET /api/health — liveness + DB reachability + free-tier fuel gauges.
 * Caching intent: dynamic (never cached; hits the DB on every call).
 * Flags (plan §5): prices_fresh false when newest price update > 48h old;
 * size_alert true when the DB crosses ~350MB (Neon free ceiling ~0.5GB).
 */
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";

export const dynamic = "force-dynamic";

const PRICE_STALE_HOURS = 48;
const SIZE_ALERT_MB = 350;

export async function GET() {
  try {
    const db = getDb();
    const [row] = await db.execute<{
      games: number;
      price_age_hours: number | null;
      db_size_mb: number;
    }>(sql`
      SELECT (SELECT count(*)::int FROM games) AS games,
             (SELECT extract(epoch FROM now() - max(price_updated_at)) / 3600.0
                FROM card_printings)::float AS price_age_hours,
             (pg_database_size(current_database()) / 1048576.0)::float AS db_size_mb
    `);
    const priceAge = row.price_age_hours;
    return NextResponse.json({
      ok: true,
      db: "up",
      games: row.games,
      prices_fresh: priceAge !== null && priceAge < PRICE_STALE_HOURS,
      price_age_hours: priceAge === null ? null : Math.round(priceAge * 10) / 10,
      db_size_mb: Math.round(row.db_size_mb),
      size_alert: row.db_size_mb > SIZE_ALERT_MB,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, db: "down", error: message }, { status: 503 });
  }
}
