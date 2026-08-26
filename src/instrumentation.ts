/**
 * Server-side Sentry wiring (P1.8). Error monitoring only — tracing off to
 * protect the free-tier quota. Activates only when SENTRY_DSN (or the client's
 * NEXT_PUBLIC_SENTRY_DSN) is set, so builds and local dev work without it and
 * nothing here touches next.config.ts (`output: "standalone"` off-Vercel must
 * keep working — no withSentryConfig, no source-map upload).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export function register() {
  if (!dsn) return;
  // One init covers both server runtimes; nothing edge-only is configured.
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

/** Server errors (RSC renders + route handlers) → Sentry. */
export const onRequestError = Sentry.captureRequestError;
