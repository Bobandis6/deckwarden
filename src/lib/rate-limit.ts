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
 * Every write policy in one place — anon routes keyed by IP, session-only
 * routes (P2.2) by user id. `ip` may be null (no forwarding header, e.g.
 * local dev) — those callers share one bucket, which only ever matters off
 * Vercel.
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
  /**
   * GET /api/decks/[id]/recommendations — the one rate-limited READ (P3.2
   * call): ~4 batched queries + ranking make it the most compute-expensive
   * request on the Neon budget, and public decks expose it to anyone. The
   * panel fetches once per settled autosave burst, so 30/min is unreachable
   * in honest use while still cutting scripted hammering off.
   */
  recommendations: (ip: string | null): RateLimit[] => [
    { key: `recommend:ip:${ip ?? "unknown"}`, max: 30, windowSeconds: 60 },
  ],
  /**
   * GET /api/decks/[id]/combos — the Combo Radar read (P3.3). Cheaper than
   * recommendations (~4 queries vs ~6, no ranking pass) but publicly
   * reachable the same way and fetched under the same once-per-settled-save
   * panel policy — so the same 30/min stance, its own bucket.
   */
  deckCombos: (ip: string | null): RateLimit[] => [
    { key: `deck-combos:ip:${ip ?? "unknown"}`, max: 30, windowSeconds: 60 },
  ],
  /** POST /api/decks/claim — once per sign-in, but each call can probe 100 ids. */
  deckClaim: (ip: string | null): RateLimit[] => [
    { key: `deck-claim:ip:${ip ?? "unknown"}`, max: 10, windowSeconds: 60 },
  ],
  /**
   * PATCH /api/profile — session-only route, so the principal is the user id.
   * Tight: changing a username releases the old one; cycling squats names.
   */
  profileWrite: (userId: string): RateLimit[] => [
    { key: `profile:user:${userId}`, max: 10, windowSeconds: 3600 },
  ],
  /** POST /api/folders — session-only; FOLDER_LIMITS.perUser is the real cap. */
  folderCreate: (userId: string): RateLimit[] => [
    { key: `folder-create:user:${userId}`, max: 30, windowSeconds: 3600 },
  ],
  /** PATCH/DELETE /api/folders/[id] — checked before auth, so keyed like deckMetaWrite. */
  folderMetaWrite: (ip: string | null, folderId: string): RateLimit[] => [
    { key: `folder-meta:folder:${folderId}`, max: 60, windowSeconds: 60 },
    { key: `folder-meta:ip:${ip ?? "unknown"}`, max: 180, windowSeconds: 60 },
  ],
  /**
   * PUT/DELETE /api/decks/[id]/(like|bookmark) — session-only click toggles
   * (P2.3), so the principal is the user id. Generous per-minute (UI is
   * optimistic; a flappy click burst is legit) with an hourly lid so a
   * scripted session can't inflate counts by sheer volume.
   */
  deckEngagement: (userId: string): RateLimit[] => [
    { key: `engage:user:${userId}`, max: 30, windowSeconds: 60 },
    { key: `engage:user-hour:${userId}`, max: 300, windowSeconds: 3600 },
  ],
  /**
   * POST /api/decks/[id]/versions + restore/delete (P3.6) — owner writes,
   * checked before auth like deckMetaWrite. Versions are deliberate clicks,
   * never autosaved, so 30/min per deck is unreachable in honest use.
   */
  deckVersionWrite: (ip: string | null, deckId: string): RateLimit[] => [
    { key: `deck-version:deck:${deckId}`, max: 30, windowSeconds: 60 },
    { key: `deck-version:ip:${ip ?? "unknown"}`, max: 90, windowSeconds: 60 },
  ],
  /**
   * POST /api/decks/[id]/fork (P3.6) — session-only, so keyed by user id;
   * the route ALSO consumes deckCreate(ip) because a fork mints a deck row
   * the purge policy never reaps (it's an account deck).
   */
  deckFork: (userId: string): RateLimit[] => [
    { key: `deck-fork:user:${userId}`, max: 10, windowSeconds: 3600 },
  ],
  /** DELETE /api/account — a legit user needs this once, ever. */
  accountDelete: (userId: string): RateLimit[] => [
    { key: `account-delete:user:${userId}`, max: 3, windowSeconds: 3600 },
  ],
};

const { rateLimitCounters } = schema;

/** One atomic check-and-increment against a counter; throws on DB failure. */
export async function consumeRateLimit(
  limit: RateLimit,
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
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
      const result = await consumeRateLimit(limit);
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

/**
 * Better Auth rate-limit backend (P2.8, fired LATER row): plugs the same
 * counters table into better-auth's limiter via its `customStorage` hook, so
 * /api/auth/* gets a serverless-correct limiter without a second table or a
 * second write pattern (better-auth's default store is per-instance memory —
 * a placebo on serverless; its "database" backend would mean another table).
 *
 * Better-auth's keys are already ip+path; the "auth:" prefix just namespaces
 * them among ours in the shared table, and the nightly purge sweeps them
 * with everything else. Its `window` is seconds, like windowSeconds.
 *
 * Cost note: only real HTTP requests to /api/auth/* pass through better-auth's
 * router (where the limiter runs) — server-side auth.api.getSession calls on
 * SSR renders never do — so this is one upsert per client auth call, not per
 * page view. Fail-open like enforceRateLimit: sign-in must never die on a
 * limiter error.
 */
export const betterAuthRateLimitStorage = {
  async consume(
    key: string,
    rule: { window: number; max: number },
  ): Promise<{ allowed: boolean; retryAfter: number | null }> {
    try {
      const result = await consumeRateLimit({
        key: `auth:${key}`,
        max: rule.max,
        windowSeconds: rule.window,
      });
      return result.ok
        ? { allowed: true, retryAfter: null }
        : { allowed: false, retryAfter: result.retryAfterSeconds };
    } catch (err) {
      console.error("auth rate limit check failed open:", err);
      return { allowed: true, retryAfter: null };
    }
  },
};
