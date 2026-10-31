/**
 * @vitest-environment node
 *
 * The server runtimes' Sentry options (S2, SECURITY-AUDIT-report.md M3) on
 * the real SDK: @sentry/nextjs's Node build, a NodeClient whose transport
 * keeps the serialized envelope instead of sending it. Each event is
 * captured the way captureRequestError captures a server error — the
 * request's headers and the client address on the scope's SDK metadata —
 * for a guest editing a deck while signed in:
 *  - the defaults P1.8 shipped reproduce M3: the session cookies and the
 *    x-deck-token header reach the envelope raw (the SDK's sensitive-key
 *    filter runs on the span path only);
 *  - serverSentryOptions ships the method and the URL alone — no header,
 *    no cookie, no IP, no marker anywhere in the serialized envelope;
 *  - the second lock alone (the defaults plus beforeSend) is enough.
 * A failed statement's text — the 2026-10-30 finding — is bound-params.test.ts,
 * on production's whole init.
 */
import * as Sentry from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { beforeSend } from "./options";
import { serverSentryOptions } from "./server-options";

const DSN = "https://probe@o0.ingest.sentry.invalid/1";

const MARKERS = {
  session: "SESSION-TOKEN-MARKER",
  data: "SESSION-DATA-MARKER",
  claim: "DECK-TOKEN-MARKER",
  ip: "203.0.113.9",
} as const;

/** What captureRequestError puts on the scope for the error. */
const REQUEST = {
  headers: {
    cookie: `__Secure-better-auth.session_token=${MARKERS.session}; __Secure-better-auth.session_data=${MARKERS.data}`,
    "x-deck-token": MARKERS.claim,
    "x-forwarded-for": MARKERS.ip,
    "user-agent": "vitest",
  },
  method: "GET",
  url: "https://deckwarden.gg/decks/abc/edit",
};

type ClientOptions = ConstructorParameters<typeof Sentry.NodeClient>[0];

/** Captures one exception through a client built from `options`; answers the envelope and its event. */
async function envelopeFor(options: Omit<ClientOptions, "transport" | "stackParser">) {
  const bodies: string[] = [];
  const client = new Sentry.NodeClient({
    ...options,
    transport: (transportOptions) =>
      Sentry.createTransport(transportOptions, async (request) => {
        bodies.push(
          typeof request.body === "string" ? request.body : new TextDecoder().decode(request.body),
        );
        return { statusCode: 200 };
      }),
    stackParser: Sentry.defaultStackParser,
  });
  client.init();
  const scope = new Sentry.Scope();
  scope.setClient(client);
  scope.setSDKProcessingMetadata({ normalizedRequest: REQUEST, ipAddress: MARKERS.ip });
  client.captureException(new Error("boom"), {}, scope);
  expect(await client.flush(5_000)).toBe(true);
  await client.close(1_000);
  expect(bodies).toHaveLength(1);
  const body = bodies[0] ?? "";
  // An envelope is JSON lines: the envelope header, then an item header and its payload per item.
  const lines = body.split("\n");
  const header = lines.findIndex((line, i) => i > 0 && line.includes('"type":"event"'));
  expect(header).toBeGreaterThan(0);
  const event = JSON.parse(lines[header + 1] ?? "{}") as Sentry.Event;
  return { body, event };
}

describe("serverSentryOptions", () => {
  it("carries the DSN and environment, tracing off, PII off, the scrubber, one RequestData integration and an empty ContextLines", () => {
    const options = serverSentryOptions({ dsn: DSN, environment: "probe" });
    expect(options.dsn).toBe(DSN);
    expect(options.environment).toBe("probe");
    expect(options.tracesSampleRate).toBe(0);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.beforeSend).toBe(beforeSend);
    expect(options.integrations.map((integration) => integration.name)).toEqual([
      "RequestData",
      "ContextLines",
    ]);
    // The replacement has no hook at all: nothing opens a file, nothing touches a frame.
    expect(options.integrations[1]).toEqual({ name: "ContextLines" });
  });
});

describe("on the real SDK", () => {
  it("the defaults P1.8 shipped put the session cookies and the claim token on the event (M3)", async () => {
    const { body, event } = await envelopeFor({
      dsn: DSN,
      tracesSampleRate: 0,
      integrations: [Sentry.requestDataIntegration()],
    });
    expect(event.request?.cookies?.["__Secure-better-auth.session_token"]).toBe(MARKERS.session);
    expect(event.request?.headers?.["x-deck-token"]).toBe(MARKERS.claim);
    expect(body).toContain(MARKERS.data);
  });

  it("serverSentryOptions ships the method and the URL alone", async () => {
    const { body, event } = await envelopeFor(
      serverSentryOptions({ dsn: DSN, environment: "test" }),
    );
    expect(event.request).toEqual({ method: "GET", url: REQUEST.url });
    expect(event.user?.ip_address).toBeUndefined();
    for (const marker of Object.values(MARKERS)) expect(body).not.toContain(marker);
  });

  it("the second lock alone — the defaults plus beforeSend — strips them too", async () => {
    const { body, event } = await envelopeFor({
      dsn: DSN,
      tracesSampleRate: 0,
      integrations: [Sentry.requestDataIntegration()],
      beforeSend,
    });
    expect(event.request?.cookies).toBeUndefined();
    // The SDK itself drops the IP headers (its `ip` include is off); the scrubber the other two.
    expect(event.request?.headers).toEqual({ "user-agent": "vitest" });
    expect(event.user?.ip_address).toBeUndefined();
    for (const marker of Object.values(MARKERS)) expect(body).not.toContain(marker);
  });
});
