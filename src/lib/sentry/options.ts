/**
 * What Deckwarden lets Sentry see (S2, SECURITY-AUDIT-report.md M3; the
 * text scrub since the 2026-10-30 audit's one medium finding,
 * `scrubEvent:drizzle-bound-params-in-event-text`). One pure module behind
 * both Sentry inits — src/instrumentation.ts (the Node and edge runtimes,
 * through server-options.ts) and src/instrumentation-client.ts (the
 * browser) — so the policy lives in one place and a unit test runs it with
 * no SDK (options.test.ts).
 *
 * The first finding (M3). @sentry/nextjs's `onRequestError` hook
 * (captureRequestError) puts every incoming header on the event's scope, and
 * @sentry/core 10.71's RequestData integration copies them onto the error
 * event RAW: its `include.cookies` and `include.headers` are on by default,
 * and the SDK's sensitive-key filter (names containing auth, token, session,
 * __secure-) runs only on the span path, which `tracesSampleRate: 0` never
 * takes. `sendDefaultPii: false` alone changes nothing on that path. So
 * every server error for a signed-in user shipped the
 * `__Secure-better-auth.session_token` and `session_data` cookies, and a
 * guest's editor errors the `x-deck-token` claim token, to Sentry — a live
 * session for anyone with project access (measured on the real SDK:
 * server-options.test.ts reproduces it before pinning the fix).
 *
 * The second finding (2026-10-30). The same values travel as TEXT. When a
 * statement fails, drizzle-orm's DrizzleQueryError message is
 * `Failed query: <sql>\nparams: <every bound value>`
 * (node_modules/drizzle-orm/errors.js), the route handlers don't catch it,
 * Next logs it through console.error and hands it to the hook, and the SDK
 * copies the text into `exception.values[].value` (whole: no maxValueLength
 * is set, and LinkedErrors adds the cause chain, so a Better Auth error still
 * ships the statement beneath it), into the Console breadcrumb's `message`
 * and `data.arguments`, and — because a message's lines are the first lines
 * of `error.stack` and the SDK's Node stack parser takes any line holding
 * "at " for a frame — into `stacktrace.frames[]` as filenames and function
 * names ("Look at my sideboard plan"). So a failed deck create or fork sent
 * the client IP (created_ip), a failed deck or journal write the private
 * text, a failed claim UPDATE a live claim token, and a failed session lookup
 * the raw session token. A frame shaped `at /some/path:1:2` also made the
 * SDK's default ContextLines integration open that path on the server and
 * attach its lines (server-options.ts replaces it).
 *
 * Three locks, each sufficient alone for the fields it covers:
 *  1. the RequestData integration is told to copy none of cookies, headers
 *     or the IP (REQUEST_DATA_INCLUDE; server-options.ts builds it), and
 *     `sendDefaultPii: false` is set explicitly on both runtimes — the
 *     default, so the intent reads; v11 replaces it with `dataCollection`
 *     and defaults to collecting everything (LATER.md row 277);
 *  2. `beforeSend` scrubs the event's structured fields (scrubEvent): the
 *     cookies map, the cookie / authorization / x-deck-token headers whatever
 *     their case, the request body and `user.ip_address` — whichever
 *     integration or wrapper put them there;
 *  3. `beforeSend` scrubs the event's TEXT (scrubEvent, withoutBoundParams):
 *     everything from the first `\nparams: ` on is cut from every exception
 *     value, the event message and every breadcrumb message — the statement
 *     stays, the values go (the first `\nparams: ` is Drizzle's own, since
 *     statement text never holds one, so a value with its own "params:" line
 *     is cut too); a console breadcrumb loses its `data` (its arguments are
 *     the logged objects whole, an Error's own fields among them — a
 *     DrizzleQueryError carries `params` as an array no text rule sees); an
 *     exception whose value held the text keeps only the frames that came
 *     from code (isCodeFrame: a file and a line the message never spelled
 *     out), and no frame keeps `vars`.
 *
 * Not here, and still needed: the Sentry project's server-side scrubbing
 * (Settings → Security & Privacy) is the console half; and for BROWSER
 * events Relay fills in the client's address itself unless "Prevent
 * Storing of IP Addresses" is on there — the SDK sends none (nothing sets
 * `{{auto}}` in 10.71 with the flag off), but it cannot forbid the
 * inference from the connection. What stays by design, the residuals and the
 * one limit are LATER.md rows 362 to 364: the failing URL and the ids in it,
 * a Postgres message that quotes a rejected value, a dropped connection's
 * host and port, the server log, and the code frames a note of fifty
 * frame-shaped lines starves before any scrubber runs (the SDK's own cap).
 */
import type { ErrorEvent, Event, requestDataIntegration, StackFrame } from "@sentry/nextjs";

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
 * Where drizzle-orm's DrizzleQueryError text turns from the statement into
 * its bound values: `Failed query: <sql>\nparams: <values>`. The first
 * `\nparams: ` is Drizzle's own — statement text never holds one — so the
 * match runs from there to the end, through values with lines of their own.
 */
const BOUND_PARAMS = /\nparams: [\s\S]*$/;

/** The text with a failed statement's bound values cut; text with none is returned as it came. */
export function withoutBoundParams(text: string): string {
  return text.replace(BOUND_PARAMS, "");
}

/**
 * How a file a frame came from is named: an absolute or relative path, a
 * Windows drive, or a scheme (`node:internal/…`, `file://…`,
 * `webpack-internal:///…`, `turbopack://…`, `app:///…`).
 */
const FILE_PATH = /^(?:[\\/]|[a-zA-Z]:[\\/]|\.{1,2}[\\/]|[a-zA-Z][a-zA-Z0-9.+-]*:)/;

/**
 * Whether a frame came from code rather than from the message. The SDK's
 * Node stack parser reads every line of `error.stack`, whose first lines are
 * the message, and takes any line holding "at " for a frame: a note saying
 * "Look at my sideboard plan" arrives as a frame whose filename is "my
 * sideboard plan" and no line, and a note line shaped `at /some/path:1:2`
 * as one that names that path, line 1 and column 2. A frame from code names
 * a file (FILE_PATH) and a line, and the message never spells out its
 * `file:line:column` — the one a message made is spelled there, since that
 * is where the parser read it.
 */
function isCodeFrame(frame: StackFrame, message: string): boolean {
  const filename = frame.filename ?? "";
  if (typeof frame.lineno !== "number" || !FILE_PATH.test(filename)) return false;
  const spelled =
    frame.colno === undefined
      ? `${filename}:${frame.lineno}`
      : `${filename}:${frame.lineno}:${frame.colno}`;
  return !message.includes(spelled);
}

/**
 * The second and third locks: strips the cookies, the listed headers, the
 * request body and the IP from an event in place, cuts a failed statement's
 * bound values from its text (every exception value, the message, every
 * breadcrumb), drops console breadcrumbs' data and the frames a message
 * made, and returns it. Pure — no SDK, no clock — and safe on an event with
 * no request, no headers, no exception, no breadcrumbs or no user.
 */
export function scrubEvent<E extends Event>(event: E): E {
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data;
    const headers = request.headers;
    if (headers) {
      for (const name of Object.keys(headers)) {
        if (scrubbedHeaders.has(name.toLowerCase())) delete headers[name];
      }
    }
  }
  if (event.message) event.message = withoutBoundParams(event.message);
  for (const exception of event.exception?.values ?? []) {
    const value = exception.value;
    if (value) {
      const statement = withoutBoundParams(value);
      if (statement !== value) {
        exception.value = statement;
        if (exception.stacktrace?.frames) {
          exception.stacktrace.frames = exception.stacktrace.frames.filter((frame) =>
            isCodeFrame(frame, value),
          );
        }
      }
    }
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = withoutBoundParams(crumb.message);
    if (crumb.category === "console") delete crumb.data;
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
