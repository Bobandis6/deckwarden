/**
 * Sentry probe (S1, SECURITY-AUDIT-report.md L2): proves that the configured
 * DSN accepts an event from this SDK version — the check `/api/sentry-test`
 * used to be (P1.8's "Sentry showing a test event" gate), run from a local
 * tsx process instead of served to the public, where every anonymous hit was
 * an event against the free quota and the response said whether Sentry was
 * configured at all.
 *
 * Sends ONE event ("Deckwarden Sentry probe. Everything is fine.", tagged
 * probe=true, environment "probe" so it never lands among production
 * issues) and waits for Sentry's answer: exit 0 when the ingest accepted it
 * (HTTP 200), 1 otherwise. Reads SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) from
 * the environment / .env.local and never prints it.
 *
 *   pnpm sentry:probe
 *
 * What it does not prove: that a server error inside the running app reaches
 * Sentry through src/instrumentation.ts (onRequestError) — for that, throw
 * from a throwaway local route on a dev server, never a committed one.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import * as Sentry from "@sentry/nextjs";
import type { NodeOptions } from "@sentry/nextjs";

async function main() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    console.error(
      "sentry-probe: no SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN in the environment — nothing sent.",
    );
    process.exit(1);
  }

  let status: number | undefined;
  // The stock node transport, with the ingest's answer kept: a delivered
  // event is one Sentry answered 200 to, not one that left the buffer.
  // (Typed by hand: `init` takes a union of the client, server and edge
  // option types, so the callback's parameters are not inferred.)
  const transport: NonNullable<NodeOptions["transport"]> = (options) => {
    const inner = Sentry.makeNodeTransport(options);
    return {
      send: async (request) => {
        const response = await inner.send(request);
        status = response.statusCode;
        return response;
      },
      flush: (timeout) => inner.flush(timeout),
    };
  };
  Sentry.init({ dsn, environment: "probe", tracesSampleRate: 0, transport });

  const eventId = Sentry.captureException(
    new Error("Deckwarden Sentry probe. Everything is fine."),
    {
      tags: { probe: "true" },
    },
  );
  const flushed = await Sentry.flush(10_000);

  if (flushed && status === 200) {
    console.log(
      `sentry-probe: event ${eventId} accepted (HTTP 200) — look for it under environment "probe".`,
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
