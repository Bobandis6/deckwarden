/**
 * Postgres-backed fixed-window rate limiting for anon writes (P1.8).
 *
 * Portability rules bind hard here: no @vercel/kv, Redis stays in LATER.md
 * until a measured problem, and per-instance memory dies on serverless — so
 * counters live in the `rate_limit_counters` table (one upsert per limited
 * request; stale windows swept by the nightly purge script).
 *
 * Policy shape (per the P1.8 gate): strict per-IP on deck creates, generous
 * per-deck on the editor's autosave PUTs (~1/s debounced) so legit building is
 * never throttled. Routes call `enforceRateLimit` BEFORE body parsing, so
 * malformed spam consumes quota too.
 *
 * Failure mode: fail OPEN. If the counter upsert errors the write itself will
 * almost certainly fail on the same database anyway, and a broken limiter must
 * never take down legitimate saves.
 */
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/db";

export interface RateLimit {
  /** Full counter key: route scope + principal, e.g. "deck-create:ip:1.2.3.4". */
  key: string;
  max: number;
  windowSeconds: number;
}

/** Bucket start for a fixed window (pure — unit-tested). */
export function windowStartFor(nowMs: number, windowSeconds: number): Date {
  const w = windowSeconds * 1000;
  return new Date(Math.floor(nowMs / w) * w);
}

/**
 * Every anon-write policy in one place. `ip` may be null (no forwarding
 * header, e.g. local dev) — those callers share one bucket, which only ever
 * matters off Vercel.
 */
export const RATE_LIMITS = {
  /** POST /api/decks — the strict one: creates mint rows a purge has to clean. */
  deckCreate: (ip: string | null): RateLimit[] => [
    { key: `deck-create:ip:${ip ?? "unknown"}`, max: 10, windowSeconds: 3600 },
    { key: `deck-create:ip-day:${ip ?? "unknown"}`, max: 30, windowSeconds: 86400 },
  ],
  /** PUT /api/decks/[id]/cards — autosave path; generous per deck token. */
  deckCardsPut: (ip: string | null, deckId: string): RateLimit[] => [
    { key: `deck-cards:deck:${deckId}`, max: 120, windowSeconds: 60 },
    { key: `deck-cards:ip:${ip ?? "unknown"}`, max: 360, windowSeconds: 60 },
  ],
  /** PATCH/DELETE /api/decks/[id] — name autosave + rare visibility flips. */
  deckMetaWrite: (ip: string | null, deckId: string): RateLimit[] => [
    { key: `deck-meta:deck:${deckId}`, max: 60, windowSeconds: 60 },
    { key: `deck-meta:ip:${ip ?? "unknown"}`, max: 180, windowSeconds: 60 },
  ],
  /** POST /api/cards/resolve — one request per import paste (≤400 names). */
  cardResolve: (ip: string | null): RateLimit[] => [
    { key: `card-resolve:ip:${ip ?? "unknown"}`, max: 20, windowSeconds: 60 },
    { key: `card-resolve:ip-hour:${ip ?? "unknown"}`, max: 200, windowSeconds: 3600 },
  ],
  /** POST /api/decks/mine — home-page token verification, one per visit. */
  decksMine: (ip: string | null): RateLimit[] => [
    { key: `decks-mine:ip:${ip ?? "unknown"}`, max: 30, windowSeconds: 60 },
  ],
  /** POST /api/decks/claim — once per sign-in, but each call can probe 100 ids. */
  deckClaim: (ip: string | null): RateLimit[] => [
    { key: `deck-claim:ip:${ip ?? "unknown"}`, max: 10, windowSeconds: 60 },
  ],
};

const { rateLimitCounters } = schema;

async function take(limit: RateLimit): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const windowStart = windowStartFor(Date.now(), limit.windowSeconds);
  const db = getDb();
  const [row] = await db
    .insert(rateLimitCounters)
    .values({ key: limit.key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounters.key, rateLimitCounters.windowStart],
      set: { count: sql`${rateLimitCounters.count} + 1` },
    })
    .returning({ count: rateLimitCounters.count });
  if (row.count <= limit.max) return { ok: true, retryAfterSeconds: 0 };
  const windowEnd = windowStart.getTime() + limit.windowSeconds * 1000;
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000)) };
}

/**
 * Check every limit (all counters increment — a blocked request still counts).
 * Returns the 429 to send, or null to proceed.
 */
export async function enforceRateLimit(limits: RateLimit[]): Promise<NextResponse | null> {
  try {
    let blocked: number | null = null;
    for (const limit of limits) {
      const result = await take(limit);
      if (!result.ok) blocked = Math.max(blocked ?? 0, result.retryAfterSeconds);
    }
    if (blocked !== null) {
      return NextResponse.json(
        { error: "Too many requests — try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(blocked), "Cache-Control": "no-store" },
        },
      );
    }
  } catch (err) {
    console.error("rate limit check failed open:", err);
  }
  return null;
}
