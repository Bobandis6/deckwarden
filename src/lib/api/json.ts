/**
 * The JSON-body read and the no-store answer every route handler spells the
 * same way (S8, SECURITY-AUDIT-report.md I2). Before this module eighteen
 * routes carried their own try/`request.json()`/catch + `safeParse` block,
 * four kept a local `bad()`, twenty-eight declared the same NO_STORE
 * constant, and the 400 contract had drifted between them (two routes
 * answered a refused body without the no-store header). One contract now:
 *
 *   body not JSON     → 400 { error: "Body must be JSON" }
 *   schema refuses it → 400 { error: "Invalid body", issues }   (zod's issues)
 *
 * both under `Cache-Control: no-store`, like every other answer a route
 * builds through `noStoreJson`. A route that says more than "Invalid body"
 * (the account delete's confirm phrase, the collection import's row bound)
 * passes `invalidError`; `maxIssues` caps the issue list (0 = no `issues`
 * key at all). Every limiter still runs before the body is read (P1.8, S4)
 * — this helper is called after the gates, never before.
 *
 * Lives here rather than in decks/route-helpers.ts on purpose: that module is
 * the deck gate (it imports the database, the auth instance and the adapters),
 * and the account, profile, collection, folder and card routes parse a body
 * without needing any of that.
 */
import { NextResponse } from "next/server";
import type { z } from "zod";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** `NextResponse.json` under `Cache-Control: no-store`; other `init.headers` ride along. */
export function noStoreJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

/** A 400 under no-store: `{ error }`, with `issues` only when given. */
export function badRequest(error: string, issues?: unknown): NextResponse {
  return noStoreJson(issues === undefined ? { error } : { error, issues }, { status: 400 });
}

export interface ParseJsonBodyOptions {
  /** The 400's `error` when the schema refuses the body; "Invalid body" by default. */
  invalidError?: string;
  /** Cap on the `issues` list; 0 leaves the key out; absent = every issue. */
  maxIssues?: number;
  /**
   * What an EMPTY body reads as (the version POST takes none and means `{}`);
   * absent, an empty body is not JSON and answers the 400 like any other.
   */
  emptyBody?: unknown;
}

/**
 * The request body as the schema's output, or the 400 to answer with. Read
 * the way the gates read: `if (body instanceof NextResponse) return body;`.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  opts: ParseJsonBodyOptions = {},
): Promise<z.output<S> | NextResponse> {
  let json: unknown;
  try {
    const raw = await request.text();
    json = raw === "" && "emptyBody" in opts ? opts.emptyBody : JSON.parse(raw);
  } catch {
    return badRequest("Body must be JSON");
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return parsed.data as z.output<S>;
  const error = opts.invalidError ?? "Invalid body";
  if (opts.maxIssues === 0) return badRequest(error);
  const issues =
    opts.maxIssues === undefined
      ? parsed.error.issues
      : parsed.error.issues.slice(0, opts.maxIssues);
  return badRequest(error, issues);
}
