/**
 * The Sentry privacy policy (S2, SECURITY-AUDIT-report.md M3; the text scrub
 * since the 2026-10-30 audit's medium finding) with no SDK: the RequestData
 * include flags, the beforeSend scrubber over an event shaped like
 * captureRequestError's — the structured fields, and a failed statement's
 * bound values in the event's text — and the options both runtimes spread.
 * server-options.test.ts runs the same policy on the real SDK, and
 * bound-params.test.ts the whole production init against a real
 * DrizzleQueryError.
 */
import type { ErrorEvent, StackFrame } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import {
  beforeSend,
  REQUEST_DATA_INCLUDE,
  SCRUBBED_HEADERS,
  scrubEvent,
  SENTRY_PRIVACY_OPTIONS,
  withoutBoundParams,
} from "./options";

/** A signed-in guest's editor error, as the RequestData integration would dress it. */
function serverErrorEvent(): ErrorEvent {
  return {
    type: undefined,
    event_id: "e1",
    platform: "node",
    exception: { values: [{ type: "Error", value: "boom" }] },
    request: {
      method: "GET",
      url: "https://deckwarden.gg/decks/abc/edit",
      query_string: "tab=cards",
      headers: {
        cookie:
          "__Secure-better-auth.session_token=SESSION; __Secure-better-auth.session_data=DATA",
        "x-deck-token": "CLAIM",
        authorization: "Bearer NOPE",
        "user-agent": "vitest",
        accept: "text/html",
      },
      cookies: {
        "__Secure-better-auth.session_token": "SESSION",
        "__Secure-better-auth.session_data": "DATA",
      },
    },
    user: { id: "u1", ip_address: "203.0.113.9" },
    contexts: { nextjs: { request_path: "/decks/abc/edit" } },
  };
}

describe("REQUEST_DATA_INCLUDE", () => {
  it("switches every request field the integration can copy off: cookies, headers, IP", () => {
    expect(REQUEST_DATA_INCLUDE).toEqual({ cookies: false, headers: false, ip: false });
    expect(Object.values(REQUEST_DATA_INCLUDE).every((flag) => flag === false)).toBe(true);
  });
});

describe("SENTRY_PRIVACY_OPTIONS", () => {
  it("turns default PII off and routes every error event through the scrubber", () => {
    expect(SENTRY_PRIVACY_OPTIONS).toEqual({ sendDefaultPii: false, beforeSend });
    expect(SENTRY_PRIVACY_OPTIONS.beforeSend).toBe(beforeSend);
  });
});

describe("scrubEvent", () => {
  it("deletes the cookies, the three headers and the IP in place and keeps the rest", () => {
    const event = serverErrorEvent();
    const scrubbed = scrubEvent(event);
    expect(scrubbed).toBe(event);
    expect("cookies" in (event.request ?? {})).toBe(false);
    expect(event.request?.headers).toEqual({ "user-agent": "vitest", accept: "text/html" });
    expect(event.user).toEqual({ id: "u1" });
    expect("ip_address" in (event.user ?? {})).toBe(false);
    expect(event.request?.method).toBe("GET");
    expect(event.request?.url).toBe("https://deckwarden.gg/decks/abc/edit");
    expect(event.request?.query_string).toBe("tab=cards");
    expect(event.exception?.values?.[0]?.value).toBe("boom");
    expect(event.contexts?.nextjs?.request_path).toBe("/decks/abc/edit");
  });

  it("matches the header names whatever their case", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        headers: {
          Cookie: "a=b",
          AUTHORIZATION: "Basic x",
          "X-Deck-Token": "t1",
          "x-DECK-token": "t2",
          Accept: "*/*",
        },
      },
    };
    scrubEvent(event);
    expect(event.request?.headers).toEqual({ Accept: "*/*" });
  });

  it("passes an event with no request, no headers or no user through untouched", () => {
    const bare: ErrorEvent = { type: undefined, message: "m" };
    expect(scrubEvent(bare)).toBe(bare);
    expect(bare).toEqual({ type: undefined, message: "m" });

    const headerless: ErrorEvent = { type: undefined, request: { method: "POST", url: "/x" } };
    scrubEvent(headerless);
    expect(headerless.request).toEqual({ method: "POST", url: "/x" });

    const user: ErrorEvent = { type: undefined, user: { id: "u2", email: "kept@example.test" } };
    scrubEvent(user);
    expect(user.user).toEqual({ id: "u2", email: "kept@example.test" });
  });
});

const STATEMENT =
  'update "decks" set "name" = $1, "notes" = $2 where "id" = $3 and "claim_token" = $4';

/** What drizzle-orm's DrizzleQueryError says: the statement, then every bound value. */
function failedQuery(...values: string[]): string {
  return `Failed query: ${STATEMENT}\nparams: ${values.join(",")}`;
}

/** A frame the SDK parsed from code: a file and a line. */
function codeFrame(filename: string, lineno: number, fn: string): StackFrame {
  return { filename, function: fn, lineno, colno: 7, in_app: filename.startsWith("/var/task/") };
}

describe("withoutBoundParams", () => {
  it("cuts everything from the first newline-params on, keeping the statement", () => {
    expect(withoutBoundParams(failedQuery("Goblins", "notes", "d1", "CLAIM"))).toBe(
      `Failed query: ${STATEMENT}`,
    );
  });

  it("cuts through values with lines of their own, a literal params: line among them", () => {
    const note =
      "Look at my sideboard plan\nparams: not drizzle's\nat /tmp/plan.txt:1:2\nlast line";
    expect(withoutBoundParams(failedQuery("Goblins", note, "d1", "CLAIM"))).toBe(
      `Failed query: ${STATEMENT}`,
    );
  });

  it("returns text with no params line as it came", () => {
    expect(withoutBoundParams("boom")).toBe("boom");
    expect(withoutBoundParams("params: on the first line stays")).toBe(
      "params: on the first line stays",
    );
    expect(withoutBoundParams('select "params: " from "x"')).toBe('select "params: " from "x"');
    expect(withoutBoundParams("")).toBe("");
  });
});

describe("scrubEvent on a failed statement's text", () => {
  const note = [
    "Look at my sideboard plan NOTE-MARKER",
    "mulligan hard at home games (never at the LGS)",
    "params: LITERAL-MARKER",
    "at /var/task/.next/server/app/api/decks/[id]/route.js:1:1",
    "at /tmp/PATH-MARKER/plan.txt:3:1",
  ].join("\n");
  const values = ["DECK-NAME-MARKER", note, "d0d0d0d0-0000-4000-8000-00000000d0d0", "CLAIM-MARKER"];
  const message = failedQuery(...values);

  /** The frames the SDK's Node stack parser makes of that error: the message's lines first, reversed to last. */
  const codeFrames = [
    codeFrame("node:internal/process/task_queues", 95, "process.processTicksAndRejections"),
    codeFrame("/var/task/.next/server/app/api/decks/[id]/route.js", 1, "PATCH"),
    codeFrame(
      "/var/task/node_modules/drizzle-orm/pg-core/session.js",
      41,
      "PgPreparedQuery.queryWithCache",
    ),
  ];
  const messageFrames: StackFrame[] = [
    // "at /tmp/PATH-MARKER/plan.txt:3:1" — a path and a line, but the note's own.
    { filename: "/tmp/PATH-MARKER/plan.txt", function: "?", lineno: 3, colno: 1, in_app: true },
    // "at /var/task/.next/server/app/api/decks/[id]/route.js:1:1" — a real path, written in the
    // note: this frame (column 1, the note's) goes, the code frame of that file (column 7) stays.
    {
      filename: "/var/task/.next/server/app/api/decks/[id]/route.js",
      function: "?",
      lineno: 1,
      colno: 1,
    },
    // "mulligan hard at home games (never at the LGS)": function and "filename" from the words.
    { filename: "never at the LGS", function: "home games", in_app: false },
    // "Look at my sideboard plan NOTE-MARKER": no line at all.
    { filename: "my sideboard plan NOTE-MARKER", function: "?", in_app: false },
  ];

  function statementEvent(): ErrorEvent {
    return {
      type: undefined,
      exception: {
        values: [
          {
            type: "Error",
            value: "deadlock detected",
            stacktrace: {
              frames: [
                codeFrame("/var/task/node_modules/postgres/cjs/src/connection.js", 790, "errored"),
              ],
            },
          },
          {
            type: "Error",
            value: message,
            stacktrace: {
              frames: [
                ...codeFrames.map((frame, i) =>
                  i === 1 ? { ...frame, vars: { body: "DECK-NAME-MARKER" } } : frame,
                ),
                ...messageFrames,
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        {
          category: "console",
          level: "error",
          message: `rate limit check failed open: Error: Failed query: insert into "rate_limit_counters" ("key") values ($1)\nparams: decks-mine:ip:203.0.113.9\n    at PgPreparedQuery.queryWithCache (/var/task/node_modules/drizzle-orm/pg-core/session.js:41:15) {\n  query: 'insert …',\n  params: [ 'decks-mine:ip:203.0.113.9' ]\n}`,
          data: {
            arguments: [
              "rate limit check failed open:",
              {
                message: failedQuery("decks-mine:ip:203.0.113.9"),
                params: ["decks-mine:ip:203.0.113.9"],
              },
            ],
            logger: "console",
          },
        },
        {
          category: "http",
          type: "http",
          data: { method: "GET", url: "https://api.scryfall.com/cards/abc", status_code: 200 },
        },
        { category: "console", level: "log", message: "nothing to cut here" },
      ],
      message: failedQuery("a message event, too"),
      request: {
        method: "PATCH",
        url: "https://deckwarden.gg/api/decks/d0d0d0d0",
        data: { notes: note },
      },
    };
  }

  it("cuts the values from every exception value, and the frames the message made", () => {
    const event = statementEvent();
    scrubEvent(event);
    const [cause, outer] = event.exception?.values ?? [];
    expect(cause?.value).toBe("deadlock detected");
    expect(outer?.value).toBe(`Failed query: ${STATEMENT}`);
    expect(outer?.stacktrace?.frames).toEqual(codeFrames);
    // The cause's frames are untouched: its message held no values.
    expect(cause?.stacktrace?.frames).toHaveLength(1);
  });

  it("cuts the text from the message and every breadcrumb, and drops console breadcrumbs' data", () => {
    const event = statementEvent();
    scrubEvent(event);
    expect(event.message).toBe(`Failed query: ${STATEMENT}`);
    const [limiter, http, plain] = event.breadcrumbs ?? [];
    expect(limiter?.message).toBe(
      'rate limit check failed open: Error: Failed query: insert into "rate_limit_counters" ("key") values ($1)',
    );
    expect(limiter).not.toHaveProperty("data");
    expect(http).toEqual({
      category: "http",
      type: "http",
      data: { method: "GET", url: "https://api.scryfall.com/cards/abc", status_code: 200 },
    });
    expect(plain).toEqual({ category: "console", level: "log", message: "nothing to cut here" });
  });

  it("drops the request body and every frame's vars, and keeps the URL", () => {
    const event = statementEvent();
    scrubEvent(event);
    expect(event.request).toEqual({
      method: "PATCH",
      url: "https://deckwarden.gg/api/decks/d0d0d0d0",
    });
    for (const exception of event.exception?.values ?? []) {
      for (const frame of exception.stacktrace?.frames ?? [])
        expect(frame).not.toHaveProperty("vars");
    }
  });

  it("leaves no bound value anywhere in the event", () => {
    const event = statementEvent();
    scrubEvent(event);
    const text = JSON.stringify(event);
    for (const marker of [
      "DECK-NAME-MARKER",
      "NOTE-MARKER",
      "LITERAL-MARKER",
      "PATH-MARKER",
      "CLAIM-MARKER",
      "203.0.113.9",
      "sideboard",
      "d0d0d0d0-0000-4000-8000-00000000d0d0",
    ]) {
      expect(text, marker).not.toContain(marker);
    }
    // The statement itself stays (as JSON spells it, its quotes escaped).
    expect(text).toContain(JSON.stringify(`Failed query: ${STATEMENT}`).slice(1, -1));
  });

  it("keeps the frames of an exception whose value held no statement, whatever their shape", () => {
    const frames: StackFrame[] = [
      { filename: "<anonymous>", function: "Array.map" },
      {
        filename: "https://deckwarden.gg/_next/static/chunks/app/page-abc.js",
        function: "onClick",
        lineno: 1,
        colno: 2,
      },
      { filename: "my words at a glance", function: "?" },
    ];
    const event: ErrorEvent = {
      type: undefined,
      exception: {
        values: [{ type: "TypeError", value: "x is not a function", stacktrace: { frames } }],
      },
    };
    scrubEvent(event);
    expect(event.exception?.values?.[0]?.stacktrace?.frames).toEqual(frames);
  });
});

describe("beforeSend", () => {
  it("returns the scrubbed event, never null: the event is kept, the secrets are not", () => {
    const event = serverErrorEvent();
    const sent = beforeSend(event);
    expect(sent).toBe(event);
    expect(sent.request?.cookies).toBeUndefined();
    expect(sent.request?.headers?.["x-deck-token"]).toBeUndefined();
    expect(sent.user?.ip_address).toBeUndefined();
  });

  it("scrubs exactly the cookie, authorization and x-deck-token headers", () => {
    expect([...SCRUBBED_HEADERS]).toEqual(["cookie", "authorization", "x-deck-token"]);
  });
});
