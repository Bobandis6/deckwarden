/**
 * /api/folders/[id] — rename / re-describe / set visibility, and delete (P2.2).
 *
 * Owner = session (requireOwnedFolder); status contract mirrors deck routes:
 * unknown id → 404, not yours → 403. DELETE removes only the folder — decks
 * inside it survive as unfiled via the FK's ON DELETE SET NULL, because
 * deleting an organizational grouping must never delete the things it groups.
 *
 * Caching intent: dynamic mutations, no-store.
 */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { NO_STORE, noStoreJson, parseJsonBody } from "@/lib/api/json";
import { FOLDER_LIMITS, folderMetaJson } from "@/lib/decks/folders";
import { requireOwnedFolderWrite } from "@/lib/decks/route-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PATCH_BODY = z
  .object({
    name: z.string().trim().min(1).max(FOLDER_LIMITS.nameMax),
    description: z.string().max(FOLDER_LIMITS.descriptionMax).nullable(),
    visibility: z.enum(schema.DECK_VISIBILITIES),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: "No fields to update" });

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/folders/[id]">) {
  const { id } = await ctx.params;
  // IP bucket, ownership proof, per-folder bucket (S4, M1's order).
  const access = await requireOwnedFolderWrite(request.headers, id, RATE_LIMITS.folderMetaWrite);
  if (access instanceof NextResponse) return access;

  const body = await parseJsonBody(request, PATCH_BODY);
  if (body instanceof NextResponse) return body;

  try {
    const [updated] = await getDb()
      .update(schema.deckFolders)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.deckFolders.id, access.folder.id))
      .returning();
    return noStoreJson({ folder: folderMetaJson(updated, { isOwner: true }) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return noStoreJson({ error: "You already have a folder with that name." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/folders/[id]">) {
  const { id } = await ctx.params;
  // IP bucket, ownership proof, per-folder bucket (S4, M1's order).
  const access = await requireOwnedFolderWrite(request.headers, id, RATE_LIMITS.folderMetaWrite);
  if (access instanceof NextResponse) return access;

  await getDb().delete(schema.deckFolders).where(eq(schema.deckFolders.id, access.folder.id));
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
