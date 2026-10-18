/**
 * What Deckwarden lets Sentry see (S2, SECURITY-AUDIT-report.md M3). One
 * pure module behind both Sentry inits — src/instrumentation.ts (the Node
 * and edge runtimes, through server-options.ts) and
 * src/instrumentation-client.ts (the browser) — so the policy lives in one
 * place and a unit test runs it with no SDK (options.test.ts).
 *
 * The finding. @sentry/nextjs's `onRequestError` hook (captureRequestError)
 * puts every incoming header on the event's scope, and @sentry/core 10.71's
 * RequestData integration copies them onto the error event RAW: its
 * `include.cookies` and `include.headers` are on by default, and the SDK's
 * sensitive-key filter (names containing auth, token, session, __secure-)
 * runs only on the span path, which `tracesSampleRate: 0` never takes.
 * `sendDefaultPii: false` alone changes nothing on that path. So every
 * server error for a signed-in user shipped the
 * `__Secure-better-auth.session_token` and `session_data` cookies, and a
 * guest's editor errors the `x-deck-token` claim token, to Sentry — a live
 * session for anyone with project access (measured on the real SDK:
 * server-options.test.ts reproduces it before pinning the fix).
 *
 * Two locks, each sufficient alone:
 *  1. the RequestData integration is told to copy none of cookies, headers
 *     or the IP (REQUEST_DATA_INCLUDE; server-options.ts builds it), and
 *     `sendDefaultPii: false` is set explicitly on both runtimes — the
 *     default, so the intent reads; v11 replaces it with `dataCollection`
 *     and defaults to collecting everything (LATER.md row 277);
 *  2. `beforeSend` scrubs the event itself (scrubEvent): the cookies map,
 *     the cookie / authorization / x-deck-token headers whatever their
 *     case, and `user.ip_address` — whichever integration or wrapper put
 *     them there.
 *
 * Not here, and still needed: the Sentry project's server-side scrubbing
 * (Settings → Security & Privacy) is the console half; and for BROWSER
 * events Relay fills in the client's address itself unless "Prevent
 * Storing of IP Addresses" is on there — the SDK sends none (nothing sets
 * `{{auto}}` in 10.71 with the flag off), but it cannot forbid the
 * inference from the connection.
 */
import type { ErrorEvent, Event, requestDataIntegration } from "@sentry/nextjs";

type RequestDataInclude = NonNullable<
  NonNullable<Parameters<typeof requestDataIntegration>[0]>["include"]
>;

/** What the RequestData integration may copy from the request: never cookies, headers or the IP. */
export const REQUEST_DATA_INCLUDE = {
  cookies: false,
  headers: false,
  ip: false,
} as const satisfies RequestDataInclude;

/** Request headers beforeSend deletes from an event, compared case-insensitively. */
export const SCRUBBED_HEADERS = ["cookie", "authorization", "x-deck-token"] as const;

const scrubbedHeaders = new Set<string>(SCRUBBED_HEADERS);

/**
 * The second lock: strips the cookies, the listed headers and the IP from
 * an event in place and returns it. Pure — no SDK, no clock — and safe on
 * an event with no request, no headers or no user.
 */
export function scrubEvent<E extends Event>(event: E): E {
  const request = event.request;
  if (request) {
    delete request.cookies;
    const headers = request.headers;
    if (headers) {
      for (const name of Object.keys(headers)) {
        if (scrubbedHeaders.has(name.toLowerCase())) delete headers[name];
      }
    }
  }
  if (event.user) delete event.user.ip_address;
  return event;
}

/** Sentry's `beforeSend`: every error event passes through scrubEvent; none is dropped. */
export function beforeSend(event: ErrorEvent): ErrorEvent {
  return scrubEvent(event);
}

/** The options both runtimes spread into `Sentry.init` (the DSN gating stays in each file). */
export const SENTRY_PRIVACY_OPTIONS = {
  sendDefaultPii: false,
  beforeSend,
} as const;
