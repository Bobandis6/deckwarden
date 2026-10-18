/**
 * Browser-side Sentry wiring (P1.8; the privacy options since S2,
 * SECURITY-AUDIT-report.md M3). Mirrors src/instrumentation.ts: error
 * monitoring only, DSN-gated (NEXT_PUBLIC_SENTRY_DSN is inlined at build
 * time), no tracing/replay — free-tier quota is a design constraint. The
 * browser build has no RequestData integration (there is no request on
 * this side); the scrubber still runs on every event through
 * SENTRY_PRIVACY_OPTIONS.
 */
import * as Sentry from "@sentry/nextjs";

import { SENTRY_PRIVACY_OPTIONS } from "@/lib/sentry/options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    ...SENTRY_PRIVACY_OPTIONS,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
