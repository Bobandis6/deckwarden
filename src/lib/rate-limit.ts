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
 * Order around the ownership gate (S4, SECURITY-AUDIT-report.md M1): a
 * per-RESOURCE bucket (a deck's, a folder's) is consumed only AFTER the
 * caller has proven ownership, through the `GatedWriteLimits` shape below
 * and `requireOwnedDeckWrite` / `requireOwnedFolderWrite` in
 * src/lib/decks/route-helpers.ts. Before S4 the deck routes consumed
 * `deck-cards:deck:<uuid>` and its siblings before `requireOwnedDeck`, and a
 * deck's uuid is public (every deck JSON, every share page), so anyone could
 * spend an owner's per-deck allowance with tokenless 403s — 120 a minute
 * locked the editor out of saving. The per-IP half still runs before the
 * gate: a stranger's hammering is bounded by their own address, never by the
 * owner's bucket. A non-uuid id is a 404 before any counter is touched (it
 * used to mint a counter row per arbitrary id).
 *
 * Failure mode: fail OPEN. If the counter upsert errors the write itself will
 * almost certainly fail on the same database anyway, and a broken limiter must
 * never take down legitimate saves.
 */
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/db";
import { boundAuthLimiterKey } from "@/lib/auth/known-paths";

export interface RateLimit {
  /** Full counter key: route scope + principal, e.g. "deck-create:ip:1.2.3.4". */
  key: string;
  max: number;
  windowSeconds: number;
}

/**
 * A resource write's two buckets in the order the gate consumes them (S4,
 * M1): `ip` before the ownership proof, `resource` only after it. The
 * resource half is the generous per-deck (per-folder) allowance that keeps
 * honest building unthrottled; spent by the resource's owner alone.
 */
export interface GatedWriteLimits {
  ip: (ip: string | null) => RateLimit[];
  resource: (resourceId: string) => RateLimit[];
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
  /**
   * PUT /api/decks/[id]/cards — autosave path; generous per deck. The deck
   * half is consumed after the ownership gate (S4, M1 — the docblock).
   */
  deckCardsPut: {
    ip: (ip) => [{ key: `deck-cards:ip:${ip ?? "unknown"}`, max: 360, windowSeconds: 60 }],
    resource: (deckId) => [{ key: `deck-cards:deck:${deckId}`, max: 120, windowSeconds: 60 }],
  } satisfies GatedWriteLimits,
  /** PATCH/DELETE /api/decks/[id] — name autosave + rare visibility flips; gated like deckCardsPut. */
  deckMetaWrite: {
    ip: (ip) => [{ key: `deck-meta:ip:${ip ?? "unknown"}`, max: 180, windowSeconds: 60 }],
    resource: (deckId) => [{ key: `deck-meta:deck:${deckId}`, max: 60, windowSeconds: 60 }],
  } satisfies GatedWriteLimits,
  /** POST /api/cards/resolve — one request per import paste (≤400 names). */
  cardResolve: (ip: string | null): RateLimit[] => [
    { key: `card-resolve:ip:${ip ?? "unknown"}`, max: 20, windowSeconds: 60 },
    { key: `card-resolve:ip-hour:${ip ?? "unknown"}`, max: 200, windowSeconds: 3600 },
  ],
  /**
   * GET /api/cards/search (S4, SECURITY-AUDIT-report.md M6) — a trigram
   * similarity, a full-text parse or a JSONB containment over the card
   * corpus per request, and every distinct query string is a CDN miss, so
   * a script walking unique URLs reached Neon with nothing in the way. The
   * editor's search pane asks once per 200 ms-debounced keystroke pause and
   * the /cards grid once per 250 ms-debounced filter change — a few dozen a
   * minute at the very most — so 120/min is far above honest use and 2,000/hour bounds a
   * scripted sweep to what the free compute absorbs. The per-value bounds
   * (src/lib/search/translate.ts) are the other half of M6.
   */
  cardSearch: (ip: string | null): RateLimit[] => [
    { key: `card-search:ip:${ip ?? "unknown"}`, max: 120, windowSeconds: 60 },
    { key: `card-search:ip-hour:${ip ?? "unknown"}`, max: 2000, windowSeconds: 3600 },
  ],
  /**
   * GET /api/cards/suggest (S4, M6) — the same shape for the dropdown's
   * route: the edge keeps each URL an hour, so only a miss reaches this
   * bucket, and a miss is exactly what a walk of unique strings produces.
   * The box asks once per 150 ms-debounced pause. LATER row 118 (X2's "no
   * limiter, a write per uncached request costs more than the query") is
   * fired by this: the write is the price of bounding the unique-URL walk.
   */
  cardSuggest: (ip: string | null): RateLimit[] => [
    { key: `card-suggest:ip:${ip ?? "unknown"}`, max: 120, windowSeconds: 60 },
    { key: `card-suggest:ip-hour:${ip ?? "unknown"}`, max: 2000, windowSeconds: 3600 },
  ],
  /**
   * /d/[publicId]/opengraph-image (S4, the deck OG route) — a force-dynamic
   * satori + sharp render per request (~200 ms of function CPU, three Neon
   * reads), never kept at the CDN by the privacy contract, so one share
   * link was the cheapest way to spend Hobby's monthly function time. An
   * unfurl is one fetch per link POSTED (Discord, Slack and Reddit cache the
   * image per link), so 60/min from one address is unreachable by any
   * honest crawler pool at this site's scale; over it, the standard 429
   * with Retry-After — a crawler backs off and refetches, the link still
   * unfurls with its title. Consumed before anything renders, the generic
   * image included (a malformed id costs the same satori pass).
   */
  deckPreview: (ip: string | null): RateLimit[] => [
    { key: `deck-preview:ip:${ip ?? "unknown"}`, max: 60, windowSeconds: 60 },
    { key: `deck-preview:ip-hour:${ip ?? "unknown"}`, max: 600, windowSeconds: 3600 },
  ],
  /**
   * POST /api/decks/autofill (W9a) — now the app's costliest read (~2×
   * recommendations: two candidate gathers + ranking + the planner), body-
   * driven and reachable without a deck row. 20/min absorbs honest reroll
   * bursts from the W9b sheet; the hourly lid is the Neon-compute first
   * line the Wave-2 plan calls for (client-side reroll over the returned
   * window is the recorded second).
   */
  deckAutofill: (ip: string | null): RateLimit[] => [
    { key: `deck-autofill:ip:${ip ?? "unknown"}`, max: 20, windowSeconds: 60 },
    { key: `deck-autofill:ip-hour:${ip ?? "unknown"}`, max: 200, windowSeconds: 3600 },
  ],
  /**
   * GET /api/leaders/random (W9c) — the "Surprise me" roll: one indexed
   * sample + one wire read per click, but each hit rolls fresh (no-store,
   * uncacheable by design), so it gets its own bucket instead of riding a
   * cached-read policy. 30/min covers honest re-rolling; scripted hammering
   * gets cut off before it costs Neon anything.
   */
  leadersRandom: (ip: string | null): RateLimit[] => [
    { key: `leaders-random:ip:${ip ?? "unknown"}`, max: 30, windowSeconds: 60 },
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
   * POST /api/recommendations (Y2b) — the same engine for a DRAFT's
   * snapshot. Body-driven and reachable without any deck row, so a cost
   * vector like autofill: the GET's 30/min stance plus autofill's hourly
   * lid. The draft panel asks once per settled snapshot while its tab is
   * open (a seed, a budget pick, Refresh), so neither number is reachable
   * in honest use.
   */
  recommendSnapshot: (ip: string | null): RateLimit[] => [
    { key: `recommend-snapshot:ip:${ip ?? "unknown"}`, max: 30, windowSeconds: 60 },
    { key: `recommend-snapshot:ip-hour:${ip ?? "unknown"}`, max: 200, windowSeconds: 3600 },
  ],
  /**
   * POST /api/alternatives (Y7a) — Swap Lab: the same engine as the draft
   * Suggestions POST aimed at one slot, body-driven and reachable without a
   * deck row, so the same stance in its own bucket. The Card tab asks once
   * per card per settled list when its Alternatives are opened, so neither
   * number is reachable in honest use.
   */
  alternatives: (ip: string | null): RateLimit[] => [
    { key: `alternatives:ip:${ip ?? "unknown"}`, max: 30, windowSeconds: 60 },
    { key: `alternatives:ip-hour:${ip ?? "unknown"}`, max: 200, windowSeconds: 3600 },
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
  /**
   * GET /api/combos/complete (Y4a) — the bracket read's combo facts. Edge-
   * cached per id set, so only a MISS reaches this bucket; but any uuid-
   * shaped set is a fresh URL, so walking through sets would reach Neon
   * with nothing in the way. The editor asks once per settled change of
   * the id SET (a 500 ms debounce; quantity, zone, tag and printing edits
   * never ask; an import or an Autofill apply is one call), so 60/min and
   * 600/hour sit far above honest building.
   */
  comboFacts: (ip: string | null): RateLimit[] => [
    { key: `combo-facts:ip:${ip ?? "unknown"}`, max: 60, windowSeconds: 60 },
    { key: `combo-facts:ip-hour:${ip ?? "unknown"}`, max: 600, windowSeconds: 3600 },
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
  /**
   * PUT /api/profile/avatar (X5) — session-only, so the principal is the
   * user id. Its own bucket: sharing profileWrite would let picture saves
   * spend username changes. A card-art Save costs one Scryfall API call
   * (data-cached a day per printing); 20 an hour covers trying a few cards.
   */
  profileAvatar: (userId: string): RateLimit[] => [
    { key: `profile-avatar:user:${userId}`, max: 20, windowSeconds: 3600 },
  ],
  /** POST /api/folders — session-only; FOLDER_LIMITS.perUser is the real cap. */
  folderCreate: (userId: string): RateLimit[] => [
    { key: `folder-create:user:${userId}`, max: 30, windowSeconds: 3600 },
  ],
  /**
   * PATCH/DELETE /api/folders/[id] — deckMetaWrite's twin: the folder half
   * after `requireOwnedFolder`, the IP half before it (S4, M1's order — a
   * folder's uuid reaches only its owner today, but the pattern is one).
   */
  folderMetaWrite: {
    ip: (ip) => [{ key: `folder-meta:ip:${ip ?? "unknown"}`, max: 180, windowSeconds: 60 }],
    resource: (folderId) => [{ key: `folder-meta:folder:${folderId}`, max: 60, windowSeconds: 60 }],
  } satisfies GatedWriteLimits,
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
   * gated like deckMetaWrite. Versions are deliberate clicks, never
   * autosaved, so 30/min per deck is unreachable in honest use.
   */
  deckVersionWrite: {
    ip: (ip) => [{ key: `deck-version:ip:${ip ?? "unknown"}`, max: 90, windowSeconds: 60 }],
    resource: (deckId) => [{ key: `deck-version:deck:${deckId}`, max: 30, windowSeconds: 60 }],
  } satisfies GatedWriteLimits,
  /**
   * POST /api/decks/[id]/fork (P3.6) — session-only, so keyed by user id;
   * the route ALSO consumes deckCreate(ip) because a fork mints a deck row
   * the purge policy never reaps (it's an account deck).
   */
  deckFork: (userId: string): RateLimit[] => [
    { key: `deck-fork:user:${userId}`, max: 10, windowSeconds: 3600 },
  ],
  /**
   * POST /api/decks/[id]/games and PATCH/DELETE …/games/[gameId] (Y9a,
   * WAVE4 D10) — session-only, so the principal is the user id ("a
   * per-user bucket, windows ≤ 1 day"). A write mints a ~210-byte game row
   * and at most one played snapshot (~3 KB on disk, capped per deck); a
   * game night is ten or twenty of them, so 30/min absorbs a burst of
   * Undo-and-log-again and 200 a day bounds a scripted account.
   */
  gamesWrite: (userId: string): RateLimit[] => [
    { key: `games:user:${userId}`, max: 30, windowSeconds: 60 },
    { key: `games:user-day:${userId}`, max: 200, windowSeconds: 86400 },
  ],
  /** GET /api/decks/[id]/games — the Games dialog's list, one indexed read per open. */
  gamesRead: (userId: string): RateLimit[] => [
    { key: `games-read:user:${userId}`, max: 60, windowSeconds: 60 },
  ],
  /** DELETE /api/account — a legit user needs this once, ever. */
  accountDelete: (userId: string): RateLimit[] => [
    { key: `account-delete:user:${userId}`, max: 3, windowSeconds: 3600 },
  ],
  /**
   * POST /api/collection (P3.7) — session-only, so keyed by user id. An
   * import is a rare, deliberate act (one file, one transaction of up to
   * 20k rows); 10/hour leaves room for a merge, a fix, a replace.
   */
  collectionImport: (userId: string): RateLimit[] => [
    { key: `collection-import:user:${userId}`, max: 10, windowSeconds: 3600 },
  ],
  /** DELETE /api/collection — same stance as the import. */
  collectionWipe: (userId: string): RateLimit[] => [
    { key: `collection-wipe:user:${userId}`, max: 10, windowSeconds: 3600 },
  ],
  /**
   * POST /api/collection/owned — the editor asking which newly added cards
   * the user owns (≤400 ids, debounced client-side per settled burst).
   */
  collectionOwned: (userId: string): RateLimit[] => [
    { key: `collection-owned:user:${userId}`, max: 60, windowSeconds: 60 },
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
        { error: "Too many requests. Try again shortly." },
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
 * Better-auth's keys are ip+path. The "auth:" prefix namespaces them among
 * ours in the shared table, and since the 2026-10-30 security audit (its
 * counters-cardinality record) the path half is bounded to the mounted
 * route pattern it instantiates — or one shared `/__unknown` bucket — and
 * the ip half to 64 characters (lib/auth/known-paths.ts): the library keys
 * the raw path before the route resolves, so every GET /api/auth/<fresh>
 * and every /callback/<fresh> had minted its own persistent row, uncapped in
 * number. One address now holds at most (patterns + 1) keys, and a flood of
 * fresh paths shares a key and meets the per-key ceiling. The patterns come
 * from auth.ts once `betterAuth()` has returned (`setAuthPathPatterns`,
 * since this module cannot import auth.ts without a cycle); until then
 * every path maps to the unknown bucket — bounded, never open. The nightly
 * purge sweeps `auth:` rows after an hour (their windows are 10 seconds)
 * and the rest after two days. Its `window` is seconds, like windowSeconds.
 *
 * Cost note: only real HTTP requests to /api/auth/* pass through better-auth's
 * router (where the limiter runs) — server-side auth.api.getSession calls on
 * SSR renders never do — and the one client call every page view makes, the
 * header's GET /get-session, is exempt from the limiter (S3,
 * SECURITY-AUDIT-report.md L21: src/lib/auth/limiter-rules.ts; before that it
 * was one upsert per page view by every visitor). So this is one upsert per
 * sign-in, sign-out or other client auth call. Fail-open like
 * enforceRateLimit: sign-in must never die on a limiter error.
 */
let authPatterns: readonly string[] = [];

/** The mounted Better Auth route patterns (auth.ts sets them once the instance exists). */
export function setAuthPathPatterns(patterns: readonly string[]): void {
  authPatterns = patterns;
}

/** What the storage bounds a library key to — exported for the tests. */
export function authLimiterKey(key: string): string {
  return boundAuthLimiterKey(key, authPatterns);
}

export const betterAuthRateLimitStorage = {
  async consume(
    key: string,
    rule: { window: number; max: number },
  ): Promise<{ allowed: boolean; retryAfter: number | null }> {
    try {
      const result = await consumeRateLimit({
        key: authLimiterKey(key),
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
