/**
 * The server runtimes' Sentry options (S2, SECURITY-AUDIT-report.md M3):
 * options.ts's privacy options plus the RequestData integration built with
 * REQUEST_DATA_INCLUDE — the one integration that copies request data onto
 * error events, replaced by name (@sentry/core keeps a user-supplied
 * instance over its default one of the same name). Imported by
 * src/instrumentation.ts for the Node and edge runtimes (both builds of
 * @sentry/nextjs export `requestDataIntegration`; the browser build does
 * not, which is why this is not in options.ts) and by
 * scripts/sentry-probe.ts, so the probe initialises exactly what
 * production does. server-options.test.ts runs it on the real SDK.
 */
import { requestDataIntegration, type NodeOptions } from "@sentry/nextjs";

import { REQUEST_DATA_INCLUDE, SENTRY_PRIVACY_OPTIONS } from "./options";

export function serverSentryOptions(options: { dsn: string; environment: string | undefined }) {
  return {
    dsn: options.dsn,
    environment: options.environment,
    // Error monitoring only — tracing off (the free-tier quota is a design constraint).
    tracesSampleRate: 0,
    ...SENTRY_PRIVACY_OPTIONS,
    integrations: [requestDataIntegration({ include: REQUEST_DATA_INCLUDE })],
  } satisfies NodeOptions;
}
