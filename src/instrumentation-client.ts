/**
 * Browser-side Sentry wiring (P1.8). Mirrors src/instrumentation.ts: error
 * monitoring only, DSN-gated (NEXT_PUBLIC_SENTRY_DSN is inlined at build
 * time), no tracing/replay — free-tier quota is a design constraint.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
