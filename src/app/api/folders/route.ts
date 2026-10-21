/**
 * POST /api/folders — create a deck folder (P2.2).
 *
 * Session-only (401 signed out): folders are account furniture — guests
 * organize nothing, so there's no token path and no honeypot (an OAuth
 * session is a higher bar than any honeypot). Default visibility unlisted,
 * same reasoning as decks: the share URL works out of the box without
 * listing anyone's organization publicly.
 *
 * Caching intent: dynamic mutation, no-store.
 */
import { count, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { getSessionUserId } from "@/lib/auth";
import { FOLDER_LIMITS, folderMetaJson } from "@/lib/decks/folders";
import { newPublicId } from "@/lib/decks/public-id";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BODY = z.object({
  name: z.string().trim().min(1).max(FOLDER_LIMITS.nameMax),
  description: z.string().max(FOLDER_LIMITS.descriptionMax).optional(),
  visibility: z.enum(schema.DECK_VISIBILITIES).default("unlisted"),
});

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) {
    return noStoreJson({ error: "Sign in to create folders" }, { status: 401 });
  }
  const limited = await enforceRateLimit(RATE_LIMITS.folderCreate(userId));
  if (limited) return limited;

  const body = await parseJsonBody(request, BODY);
  if (body instanceof NextResponse) return body;

  const db = getDb();
  const [{ existing }] = await db
    .select({ existing: count() })
    .from(schema.deckFolders)
    .where(eq(schema.deckFolders.userId, userId));
  if (existing >= FOLDER_LIMITS.perUser) {
    return noStoreJson(
      { error: `Folder limit reached (${FOLDER_LIMITS.perUser}).` },
      { status: 400 },
    );
  }

  try {
    const [folder] = await db
      .insert(schema.deckFolders)
      .values({
        publicId: newPublicId(),
        userId,
        name: body.name,
        description: body.description ?? null,
        visibility: body.visibility,
      })
      .returning();
    return noStoreJson({ folder: folderMetaJson(folder, { isOwner: true }) }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // (user_id, lower(name)) — the public_id space makes its own
      // collisions negligible (public-id.ts), so name is the realistic hit.
      return noStoreJson({ error: "You already have a folder with that name." }, { status: 409 });
    }
    throw err;
  }
}
