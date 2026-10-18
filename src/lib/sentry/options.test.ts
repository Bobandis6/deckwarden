/**
 * The Sentry privacy policy (S2, SECURITY-AUDIT-report.md M3) with no SDK:
 * the RequestData include flags, the beforeSend scrubber over an event
 * shaped like captureRequestError's, and the options both runtimes spread.
 * server-options.test.ts runs the same policy on the real SDK.
 */
import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import {
  beforeSend,
  REQUEST_DATA_INCLUDE,
  SCRUBBED_HEADERS,
  scrubEvent,
  SENTRY_PRIVACY_OPTIONS,
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
