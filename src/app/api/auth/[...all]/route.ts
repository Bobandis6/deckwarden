/**
 * Better Auth handler (P2.1): OAuth start/callback, session reads, and
 * sign-out all live under /api/auth/*.
 *
 * Caching intent: force-dynamic — every response is per-caller (cookies).
 */
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
