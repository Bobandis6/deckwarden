/**
 * Sentry probe (S1, SECURITY-AUDIT-report.md L2; the scrub proof since S2,
 * M3): proves that the configured DSN accepts an event from this SDK
 * version, initialised with EXACTLY the server options production uses
 * (src/lib/sentry/server-options.ts), and that the event leaves without the
 * request's cookies, claim token or client address — the check
 * `/api/sentry-test` used to be (P1.8's "Sentry showing a test event" gate),
 * run from a local tsx process instead of served to the public.
 *
 * The event is captured the way src/instrumentation.ts's onRequestError
 * captures a server error (captureRequestError's shape: the request's
 * headers on the scope's SDK metadata), with a fake request carrying marker
 * values — a session cookie, a session_data cookie, an x-deck-token header,
 * an x-forwarded-for address — so what lands in Sentry is M3's scenario.
 * Before anything is sent, the wrapped transport reads the serialized
 * envelope: a marker found there means the scrub failed, the envelope is
 * dropped unsent, and the exit code is 1. So the probe cannot leak, even
 * when it fails.
 *
 *   pnpm sentry:probe            one event to the DSN in the environment /
 *                                .env.local (quota: 1; never printed); exit 0
 *                                only when the ingest answered HTTP 200
 *   pnpm sentry:probe --dry-run  the whole pipeline with nothing sent — no
 *                                DSN needed; exit 0 when the envelope is clean
 *
 * What it does not prove: that a server error inside the running app
 * reaches Sentry through src/instrumentation.ts — for that, throw from a
 * throwaway local route on a dev server, never a committed one.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import * as Sentry from "@sentry/nextjs";
import type { NodeOptions } from "@sentry/nextjs";

import { serverSentryOptions } from "../src/lib/sentry/server-options";

const DRY_RUN = process.argv.includes("--dry-run");

/** Syntactically a DSN, never contacted: on a dry run the transport sends nothing. */
const DRY_RUN_DSN = "https://probe@o0.ingest.sentry.io/0";

const MARKERS = {
  "session cookie": "probe-session-token-marker",
  "session_data cookie": "probe-session-data-marker",
  "x-deck-token": "probe-deck-token-marker",
  "IP address": "203.0.113.9",
} as const;

/** The request captureRequestError would put on the scope for a guest's editor error. */
const PROBE_REQUEST = {
  headers: {
    cookie: `__Secure-better-auth.session_token=${MARKERS["session cookie"]}; __Secure-better-auth.session_data=${MARKERS["session_data cookie"]}`,
    "x-deck-token": MARKERS["x-deck-token"],
    "x-forwarded-for": MARKERS["IP address"],
    "user-agent": "Deckwarden sentry-probe",
  },
  method: "GET",
  url: "https://deckwarden.gg/decks/probe/edit",
};

type Transport = ReturnType<NonNullable<NodeOptions["transport"]>>;
type Envelope = Parameters<Transport["send"]>[0];

type Verdict = { leaked: string[]; requestKept: boolean };

/** What the ingest would receive: the envelope's headers and every item, serialized as the SDK does. */
function inspect(envelope: Envelope): Verdict {
  const text = JSON.stringify(envelope);
  const leaked = Object.entries(MARKERS)
    .filter(([, value]) => text.includes(value))
    .map(([name]) => name);
  return { leaked, requestKept: text.includes(PROBE_REQUEST.url) };
}

async function main() {
  const configured = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!configured && !DRY_RUN) {
    console.error(
      "sentry-probe: no SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN in the environment — nothing sent (`--dry-run` needs none).",
    );
    process.exit(1);
  }
  const dsn = DRY_RUN ? DRY_RUN_DSN : String(configured);

  let status: number | undefined;
  let verdict: Verdict | undefined;
  // The stock node transport, with the envelope read first and the ingest's
  // answer kept: a delivered event is one Sentry answered 200 to, not one
  // that left the buffer. (Typed by hand: `init` takes a union of the
  // client, server and edge option types, so the callback's parameters are
  // not inferred.)
  const transport: NonNullable<NodeOptions["transport"]> = (options) => {
    const inner = Sentry.makeNodeTransport(options);
    return {
      send: async (envelope) => {
        verdict = inspect(envelope);
        // The gate: a marker in the serialized envelope means the scrub
        // failed — the envelope is dropped here, never sent.
        if (verdict.leaked.length > 0 || DRY_RUN) return {};
        const response = await inner.send(envelope);
        status = response.statusCode;
        return response;
      },
      flush: (timeout) => inner.flush(timeout),
    };
  };
  Sentry.init({ ...serverSentryOptions({ dsn, environment: "probe" }), transport });

  let eventId = "";
  Sentry.withScope((scope) => {
    scope.setSDKProcessingMetadata({
      normalizedRequest: PROBE_REQUEST,
      ipAddress: MARKERS["IP address"],
    });
    eventId = Sentry.captureException(new Error("Deckwarden Sentry probe. Everything is fine."), {
      tags: { probe: "true" },
    });
  });
  const flushed = await Sentry.flush(10_000);

  if (!verdict) {
    console.error(
      `sentry-probe: event ${eventId} never reached the transport (${flushed ? "nothing to send" : "flush timed out"}).`,
    );
    process.exitCode = 1;
    return;
  }
  if (verdict.leaked.length > 0) {
    console.error(
      `sentry-probe: the envelope carried the ${verdict.leaked.join(", ")} — dropped, NOT sent. The scrub failed: fix src/lib/sentry before deploying.`,
    );
    process.exitCode = 1;
    return;
  }
  if (!verdict.requestKept) {
    console.error(
      "sentry-probe: the probe request never reached the event (no URL on it) — the pipeline was not exercised.",
    );
    process.exitCode = 1;
    return;
  }
  const clean =
    "no session cookie, no x-deck-token, no IP (checked on the serialized envelope before sending; the request's method and URL kept)";
  if (DRY_RUN) {
    console.log(
      `sentry-probe (dry run): event ${eventId} left the pipeline with ${clean}; nothing sent.`,
    );
    return;
  }
  if (flushed && status === 200) {
    console.log(
      `sentry-probe: event ${eventId} accepted (HTTP 200) with ${clean} — look for it under environment "probe".`,
    );
    return;
  }
  console.error(
    `sentry-probe: event ${eventId} NOT delivered (${flushed ? `HTTP ${status ?? "no answer"}` : "flush timed out"}).`,
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
