/**
 * @vitest-environment node
 *
 * The 2026-10-30 audit's medium finding
 * (`src/lib/sentry/options.ts:scrubEvent:drizzle-bound-params-in-event-text`)
 * on the real SDK: production's whole init — serverSentryOptions through
 * `Sentry.init`, so every default integration runs (LinkedErrors adds the
 * cause chain, Console turns the log line into a breadcrumb, and the
 * ContextLines replacement stands where the file-reading default stood) —
 * with a transport that keeps the serialized envelope instead of sending it.
 * The error is a real DrizzleQueryError, built the way drizzle-orm builds one
 * when a statement fails (its message embeds every bound value), captured the
 * way Next's onRequestError hook captures a route handler's uncaught error,
 * after Next's own console.error of it.
 *
 * The bound values: a client IP (created_ip, and a limiter key), a deck name,
 * a live claim token and a 20,000-character note whose first lines say "at "
 * like a stack frame does — one shaped `at <this file>:3:1`, which the
 * default ContextLines would have opened. None of them may reach the
 * envelope; the statement, the failing URL and the code frames must.
 * server-options.test.ts captures `new Error("boom")`, which has none of this
 * text to lose; options.test.ts runs the scrubber with no SDK.
 */
import { fileURLToPath } from "node:url";

import * as Sentry from "@sentry/nextjs";
import { DrizzleQueryError } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { serverSentryOptions } from "./server-options";

const THIS_FILE = fileURLToPath(import.meta.url);
const DECK_ID = "d0d0d0d0-0000-4000-8000-00000000d0d0";

/** Every bound value, each distinct enough to be searched for in the envelope. */
const MARKERS = {
  ip: "198.51.100.23",
  name: "DECK-NAME-MARKER",
  claim: "c1a1a1a1-0000-4000-8000-00000000c1a1",
  session: "SESSION-TOKEN-MARKER",
  note: "NOTE-MARKER",
  literal: "LITERAL-MARKER",
  path: "PATH-MARKER",
  sideboard: "my sideboard plan",
} as const;

/** The lines of a note the SDK's stack parser takes for frames (every one holds "at "). */
const FRAME_SHAPED_LINES = [
  `Look at ${MARKERS.sideboard} ${MARKERS.note}`,
  "mulligan hard at home games (never at the LGS)",
  `params: ${MARKERS.literal}`,
  `at ${THIS_FILE}:3:1`,
  `at /tmp/${MARKERS.path}/plan.txt:1:1`,
  "    at PATCH (/var/task/.next/server/app/api/decks/[id]/route.js:1:1)",
];

/** A 20,000-character note (the route's maximum): `lines` first, then `prose` repeated. */
function longNote(lines: readonly string[], prose: string): string {
  let note = lines.join("\n");
  while (note.length < 20_000) note += `\n${prose}`;
  return note.slice(0, 20_000);
}

/** Prose that says "at " nowhere, so the stack parser makes no frame of it. */
const PLAIN_PROSE = `${MARKERS.note} ramp into the big spells, then hold up interaction once the table turns. `;

const STATEMENT =
  'update "decks" set "name" = $1, "notes" = $2 where "id" = $3 and "claim_token" = $4';

const bodies: string[] = [];
let consoleError: ReturnType<typeof vi.spyOn> | undefined;

/** The envelope the transport was handed last, and its event item. */
async function lastEnvelope(): Promise<{ body: string; event: Sentry.Event }> {
  expect(await Sentry.flush(5_000)).toBe(true);
  const body = bodies.at(-1) ?? "";
  // An envelope is JSON lines: the envelope header, then an item header and its payload per item.
  const lines = body.split("\n");
  const header = lines.findIndex((line, i) => i > 0 && line.includes('"type":"event"'));
  expect(header).toBeGreaterThan(0);
  const event = JSON.parse(lines[header + 1] ?? "{}") as Sentry.Event;
  return { body, event };
}

/** Captures a failed PATCH of a deck the way Next's hook does, after Next's console.error of it. */
function captureFailedPatch(note: string): DrizzleQueryError {
  const error = new DrizzleQueryError(
    STATEMENT,
    [MARKERS.name, note, DECK_ID, MARKERS.claim],
    new Error("deadlock detected"),
  );
  console.error(error);
  Sentry.captureRequestError(
    error,
    {
      path: `/api/decks/${DECK_ID}`,
      method: "PATCH",
      headers: {
        "x-forwarded-for": MARKERS.ip,
        "x-deck-token": MARKERS.claim,
        "user-agent": "vitest",
      },
    },
    { routerKind: "App Router", routePath: "/api/decks/[id]", routeType: "route" },
  );
  return error;
}

/** The markers the serialized envelope still holds. */
function leakedMarkers(body: string): string[] {
  return Object.entries(MARKERS)
    .filter(([, marker]) => body.includes(marker))
    .map(([name]) => name);
}

beforeAll(() => {
  // Silence the log lines below. The spy must come first: Sentry's console instrumentation wraps
  // whatever `console.error` is at init, so the breadcrumb is still made.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const transport: NonNullable<Sentry.NodeOptions["transport"]> = (options) =>
    Sentry.createTransport(options, async (request) => {
      bodies.push(
        typeof request.body === "string" ? request.body : new TextDecoder().decode(request.body),
      );
      return { statusCode: 200 };
    });
  Sentry.init({
    ...serverSentryOptions({
      dsn: "https://probe@o0.ingest.sentry.invalid/1",
      environment: "test",
    }),
    transport,
  });
});

afterAll(async () => {
  await Sentry.close(1_000);
  consoleError?.mockRestore();
});

describe("a failed statement on production's init", () => {
  it("ships the statement, the URL and the code frames, and no bound value, no file line", async () => {
    // The limiter's fail-open logs its own failed statement first (src/lib/rate-limit.ts).
    console.error(
      "rate limit check failed open:",
      new DrizzleQueryError(
        'insert into "rate_limit_counters" ("key") values ($1)',
        [`decks-mine:ip:${MARKERS.ip}`],
        new Error("deadlock detected"),
      ),
    );
    const note = longNote(FRAME_SHAPED_LINES, PLAIN_PROSE);
    expect(note).toHaveLength(20_000);
    const error = captureFailedPatch(note);
    expect(error.message).toContain(MARKERS.claim);
    const { body, event } = await lastEnvelope();

    // No bound value anywhere in the serialized envelope — not in a value, a breadcrumb, a frame.
    expect(leakedMarkers(body)).toEqual([]);
    expect(body).not.toContain("params:");

    // The statement and the cause chain stay, in the SDK's order: the cause first, the outer last.
    const values = event.exception?.values ?? [];
    expect(values.map((value) => value.value)).toEqual([
      "deadlock detected",
      `Failed query: ${STATEMENT}`,
    ]);

    // The code frames stay — this file among them — and nothing the note said is one.
    const frames = values.at(-1)?.stacktrace?.frames ?? [];
    expect(frames.length).toBeGreaterThanOrEqual(5);
    expect(frames.some((frame) => frame.filename === THIS_FILE)).toBe(true);
    for (const frame of frames) {
      expect(typeof frame.lineno, JSON.stringify(frame)).toBe("number");
      expect(frame.filename ?? "", JSON.stringify(frame)).toMatch(/^(?:\/|node:)/);
      expect(frame).not.toHaveProperty("vars");
    }
    expect(frames.some((frame) => frame.lineno === 3 && frame.filename === THIS_FILE)).toBe(false);

    // ContextLines opened no file: the default would have attached this file's lines to its frames.
    expect(body).not.toContain("context_line");
    expect(body).not.toContain("pre_context");
    expect(body).not.toContain("@vitest-environment");

    // The log lines are breadcrumbs with the statement alone, their arguments dropped.
    const crumbs = (event.breadcrumbs ?? []).filter((crumb) => crumb.category === "console");
    expect(crumbs.map((crumb) => crumb.message)).toEqual(
      expect.arrayContaining([
        'rate limit check failed open: Error: Failed query: insert into "rate_limit_counters" ("key") values ($1)',
        `Error: Failed query: ${STATEMENT}`,
      ]),
    );
    for (const crumb of crumbs) expect(crumb).not.toHaveProperty("data");

    // The failing URL stays, by design; the headers, the body and the address do not.
    expect(event.contexts?.nextjs?.request_path).toBe(`/api/decks/${DECK_ID}`);
    expect(event.request?.method).toBe("PATCH");
    expect(event.request?.headers).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.data).toBeUndefined();
    expect(event.user?.ip_address).toBeUndefined();
  });

  it("leaks nothing from a note of frame-shaped lines either, though the SDK's frame cap then leaves no code frame", async () => {
    // The stack parser stops at 50 frames, and a message's lines come before the code's in
    // `error.stack`: fifty lines saying "at " starve the real frames before any scrubber runs
    // (before this fix the event carried those fifty junk frames instead). LATER.md row 364.
    const note = longNote(
      [],
      `${MARKERS.note} ramp into the big spells, then hold up interaction at the table. `,
    );
    expect(note).toHaveLength(20_000);
    expect(note.split("\n").filter((line) => line.includes("at ")).length).toBeGreaterThan(50);
    captureFailedPatch(note);
    const { body, event } = await lastEnvelope();
    expect(leakedMarkers(body)).toEqual([]);
    expect(body).not.toContain("params:");
    const outer = event.exception?.values?.at(-1);
    expect(outer?.value).toBe(`Failed query: ${STATEMENT}`);
    expect(outer?.stacktrace?.frames ?? []).toEqual([]);
  });

  it("cuts the values from a statement beneath another error, the way Better Auth rethrows a failed session lookup", async () => {
    const lookup = new DrizzleQueryError(
      'select "id", "user_id" from "sessions" where "sessions"."token" = $1 limit $2',
      [MARKERS.session, 1],
      new Error("read ECONNRESET"),
    );
    const outer = new Error("Failed to get session", { cause: lookup });
    Sentry.captureException(outer);
    const { body, event } = await lastEnvelope();
    expect(body).not.toContain(MARKERS.session);
    expect((event.exception?.values ?? []).map((value) => value.value)).toEqual([
      "read ECONNRESET",
      'Failed query: select "id", "user_id" from "sessions" where "sessions"."token" = $1 limit $2',
      "Failed to get session",
    ]);
    // The outer error's frames are untouched: its message held no values.
    expect(event.exception?.values?.at(-1)?.stacktrace?.frames?.length).toBeGreaterThanOrEqual(5);
  });
});
