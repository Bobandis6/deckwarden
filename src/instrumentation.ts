/**
 * Server-side Sentry wiring (P1.8; the privacy options since S2,
 * SECURITY-AUDIT-report.md M3). Error monitoring only — tracing off to
 * protect the free-tier quota. Activates only when SENTRY_DSN (or the
 * client's NEXT_PUBLIC_SENTRY_DSN) is set, so builds and local dev work
 * without it and nothing here touches next.config.ts (`output: "standalone"`
 * off-Vercel must keep working — no withSentryConfig, no source-map upload).
 * The options themselves live in src/lib/sentry/ (server-options.ts over
 * options.ts), so scripts/sentry-probe.ts initialises the same thing and a
 * unit test runs the scrubber with no SDK.
 */
import * as Sentry from "@sentry/nextjs";

import { serverSentryOptions } from "@/lib/sentry/server-options";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export function register() {
  if (!dsn) return;
  // One init covers both server runtimes; nothing edge-only is configured.
  Sentry.init(
    serverSentryOptions({ dsn, environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV }),
  );
}

/** Server errors (RSC renders + route handlers) → Sentry, through the scrub above. */
export const onRequestError = Sentry.captureRequestError;
