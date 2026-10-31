/**
 * The server runtimes' Sentry options (S2, SECURITY-AUDIT-report.md M3; the
 * ContextLines replacement since the 2026-10-30 audit): options.ts's privacy
 * options plus two integrations replaced by name — @sentry/core keeps a
 * user-supplied instance over its default one of the same name:
 *  - RequestData, built with REQUEST_DATA_INCLUDE — the one integration that
 *    copies request data onto error events;
 *  - ContextLines, as an empty integration. The default opens every file a
 *    stack frame names and attaches up to fifteen of its lines to the frame
 *    (pre_context, context_line, post_context). A frame can be a line of a
 *    failed statement's bound values (options.ts explains how the stack
 *    parser makes one), so a visitor's text shaped `at /any/path:1:2` had the
 *    server read that path into the event — and reading /dev/zero cost the
 *    process hundreds of megabytes. beforeSend runs after the read, so only
 *    the integration itself can stop it. Production ships minified chunks
 *    with no uploaded source, so the lost context is small; file names and
 *    line numbers stay. A plain object, because the edge build of the SDK
 *    exports no `contextLinesIntegration` to configure down.
 * Imported by src/instrumentation.ts for the Node and edge runtimes (both
 * builds of @sentry/nextjs export `requestDataIntegration`; the browser
 * build does not, which is why this is not in options.ts) and by
 * scripts/sentry-probe.ts, so the probe initialises exactly what production
 * does. server-options.test.ts runs it on the real SDK, and
 * bound-params.test.ts runs production's whole init against a failed
 * statement.
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
    integrations: [
      requestDataIntegration({ include: REQUEST_DATA_INCLUDE }),
      // Replaces the default of the same name, which opens the files frames name (see above).
      { name: "ContextLines" },
    ],
  } satisfies NodeOptions;
}
