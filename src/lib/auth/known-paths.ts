/**
 * The HTTP paths Better Auth mounts under /api/auth, and the two uses the
 * 2026-10-30 security audit asked of them (its counters-cardinality record).
 *
 * The library's limiter runs in the router's onRequest, BEFORE the route is
 * resolved, keyed by `${ip}|${path}` with the raw request path — so any GET
 * /api/auth/<fresh-path> answered 404 and still minted one persistent
 * `rate_limit_counters` row per distinct path (the house Postgres storage,
 * rate-limit.ts; the library's own memory cap and eager pruning never apply
 * to a customStorage), with nothing bounding how many keys one address could
 * create and the nightly sweep two to three days away. Two parametrised
 * routes (`/callback/:id`, `/reset-password/:token`) had the same shape with
 * a real response: every /callback/<fresh> was its own key.
 *
 * So: (1) the catch-all route answers 404 to a path no mounted pattern
 * matches before the handler — and so before the limiter — runs, the S4 rule
 * the deck routes already keep (a non-uuid id is a 404 before any counter is
 * touched); (2) the storage bounds the key's path half to the mounted pattern
 * it instantiates (`/callback/<anything>` counts under `/callback/:id`) or to
 * one shared `/__unknown` bucket, and the ip half's length, so one address
 * holds at most (patterns + 1) keys and a flood of fresh paths shares a key
 * and meets the 100-per-10-seconds ceiling. The patterns are the library's
 * own declaration — better-call registers Object.values(auth.api) minus the
 * SERVER_ONLY endpoints in rou3, `:param` segments kept — read once at
 * startup, never a fixed allowlist: an exact-match list would have 404'd the
 * OAuth callback every sign-in needs (the audit's Phase 5 check). Pure (no
 * imports), so rate-limit.ts uses it without a cycle through auth.ts.
 * known-paths.test.ts pins the set's shape against the installed library.
 */

/** `:param` segments match exactly one non-empty segment, as rou3's do. */
const PARAM = /^:[A-Za-z_][A-Za-z0-9_]*$/;

/** The route patterns Better Auth mounts, from `auth.api` (the library's own declaration). */
export function mountedAuthPathPatterns(api: Record<string, unknown>): readonly string[] {
  const patterns = new Set<string>();
  for (const endpoint of Object.values(api)) {
    const { path, options } = endpoint as {
      path?: string;
      options?: { metadata?: { SERVER_ONLY?: boolean } };
    };
    if (path && options && !options.metadata?.SERVER_ONLY) patterns.add(path);
  }
  return [...patterns].sort();
}

/**
 * Whether a mounted pattern is a shape this matcher understands: literal
 * segments and `:param` segments, no wildcard. A library upgrade that mounts
 * a `**` route fails the test that asks this, not the guard at runtime.
 */
export function isSupportedAuthPattern(pattern: string): boolean {
  if (!pattern.startsWith("/")) return false;
  return pattern
    .slice(1)
    .split("/")
    .every((seg) => (seg.startsWith(":") ? PARAM.test(seg) : seg !== "" && !/[*:]/.test(seg)));
}

/**
 * The request path under /api/auth: the pathname without the base path and
 * without trailing slashes, "/" for the base path itself — what Better
 * Auth's normalizePathname gives the limiter.
 */
export function authRoutePath(pathname: string, basePath = "/api/auth"): string {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed === basePath) return "/";
  if (trimmed.startsWith(`${basePath}/`)) return trimmed.slice(basePath.length) || "/";
  return trimmed;
}

/**
 * The mounted pattern a path instantiates, or null. A `:param` segment
 * matches exactly one non-empty segment; literal segments match by equality.
 */
export function matchAuthPath(path: string, patterns: readonly string[]): string | null {
  const segs = path.split("/");
  for (const pattern of patterns) {
    const psegs = pattern.split("/");
    if (psegs.length !== segs.length) continue;
    if (psegs.every((p, i) => (PARAM.test(p) ? segs[i] !== "" : p === segs[i]))) return pattern;
  }
  return null;
}

/** The bucket a path no mounted pattern matches shares (the storage's second lock). */
export const UNKNOWN_AUTH_PATH = "/__unknown";

/** The ip half is bounded too: a key is a primary-key column, never a visitor-sized string. */
const IP_MAX = 64;

/**
 * The storage key for a Better Auth limiter key (`${ip}|${path}`): the ip
 * half cut to IP_MAX, the path half the mounted pattern it instantiates or
 * UNKNOWN_AUTH_PATH, under the "auth:" namespace the shared table uses.
 */
export function boundAuthLimiterKey(key: string, patterns: readonly string[]): string {
  const sep = key.indexOf("|");
  if (sep === -1) return `auth:malformed|${UNKNOWN_AUTH_PATH}`;
  const ip = key.slice(0, sep).slice(0, IP_MAX);
  return `auth:${ip}|${matchAuthPath(key.slice(sep + 1), patterns) ?? UNKNOWN_AUTH_PATH}`;
}

/**
 * The route guard: a path no mounted pattern matches is a 404 before the
 * handler — the same bare 404 better-call answers for a route it lacks — and
 * everything else, `/callback/:id` included, passes through unchanged (Better
 * Auth's own disabledPaths and route 404s still apply behind it).
 */
export function guardAuthPaths<R>(
  handler: (request: Request) => Promise<R>,
  patterns: readonly string[],
  basePath = "/api/auth",
): (request: Request) => Promise<R | Response> {
  return async (request) => {
    const path = authRoutePath(new URL(request.url).pathname, basePath);
    if (matchAuthPath(path, patterns) === null) {
      return new Response(null, { status: 404, statusText: "Not Found" });
    }
    return handler(request);
  };
}
