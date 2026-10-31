/**
 * Better Auth handler (P2.1): OAuth start/callback, session reads, and
 * sign-out all live under /api/auth/*.
 *
 * A path no mounted Better Auth route matches is a 404 here, before the
 * library's limiter runs (lib/auth/known-paths.ts, the 2026-10-30 security
 * audit's counters-cardinality record): the limiter keyed every request by
 * its raw path before the route resolved, so each GET /api/auth/<fresh-path>
 * minted a persistent counter row. The mounted set is the library's own
 * (`auth.api`), `/callback/:id` and `/reset-password/:token` matched as
 * patterns, never a fixed list.
 *
 * Caching intent: force-dynamic — every response is per-caller (cookies).
 */
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { guardAuthPaths, mountedAuthPathPatterns } from "@/lib/auth/known-paths";

export const dynamic = "force-dynamic";

const PATTERNS = mountedAuthPathPatterns(auth.api as Record<string, unknown>);
const handlers = toNextJsHandler(auth);

export const GET = guardAuthPaths(handlers.GET, PATTERNS);
export const POST = guardAuthPaths(handlers.POST, PATTERNS);
