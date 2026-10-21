/**
 * /api/collection — the user's imported collection (P3.7). Session-only on
 * every method (401 signed out): collections are account-only by
 * construction (schema.ts) — guests get a sign-in prompt, never a
 * localStorage collection.
 *
 * GET    — summary {rows, printings, identities, updatedAt}.
 * POST   — import. The CLIENT parses the CSV (src/lib/collection/parse.ts,
 *          pure, tested against real headers) and posts typed rows, the way
 *          /api/cards/resolve takes names: the server validates an array
 *          with zod, resolves rows to printings (Scryfall id → set+number →
 *          name), and writes one transaction (store.ts). Body is capped at
 *          COLLECTION_LIMITS.rowsPerImport rows (~2.5MB of JSON — under
 *          Vercel's 4.5MB request ceiling). Mode: merge (default; quantities
 *          SET per printing+finish, so a re-import can't double count) or
 *          replace (wipe, then insert).
 * DELETE — wipe. The UI confirms; the API needs no ceremony beyond the
 *          session because a wipe is recoverable by re-importing the file.
 *
 * Caching intent: force-dynamic + no-store — everything here is per-user.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { getSessionUserId } from "@/lib/auth";
import { collectionSummary } from "@/lib/collection/owned";
import { importCollection, wipeCollection } from "@/lib/collection/store";
import { COLLECTION_LIMITS, FINISHES } from "@/lib/collection/types";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ROW = z.object({
  scryfallId: z.uuid().optional(),
  name: z.string().trim().min(1).max(COLLECTION_LIMITS.nameMax),
  setCode: z.string().trim().min(1).max(COLLECTION_LIMITS.setCodeMax).optional(),
  collectorNumber: z.string().trim().min(1).max(COLLECTION_LIMITS.collectorNumberMax).optional(),
  finish: z.enum(FINISHES).default("nonfoil"),
  quantity: z.number().int().min(1).max(COLLECTION_LIMITS.maxQuantity),
});

const BODY = z.object({
  rows: z.array(ROW).min(1).max(COLLECTION_LIMITS.rowsPerImport),
  mode: z.enum(["merge", "replace"]).default("merge"),
});

function unauthorized(action: string) {
  return noStoreJson({ error: `Sign in to ${action} a collection` }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) return unauthorized("view");
  return noStoreJson({ summary: await collectionSummary(userId) });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) return unauthorized("import");
  const limited = await enforceRateLimit(RATE_LIMITS.collectionImport(userId));
  if (limited) return limited;

  const body = await parseJsonBody(request, BODY, {
    invalidError: `Invalid body: rows must be 1 to ${COLLECTION_LIMITS.rowsPerImport.toLocaleString("en-US")} parsed collection lines`,
    maxIssues: 20,
  });
  if (body instanceof NextResponse) return body;

  const report = await importCollection(userId, body.rows, body.mode);
  return noStoreJson(report);
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) return unauthorized("delete");
  const limited = await enforceRateLimit(RATE_LIMITS.collectionWipe(userId));
  if (limited) return limited;

  const deleted = await wipeCollection(userId);
  return noStoreJson({ deleted });
}
