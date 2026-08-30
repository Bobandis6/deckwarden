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
import { clientIp } from "@/lib/decks/access";
import { FOLDER_LIMITS, folderMetaJson } from "@/lib/decks/folders";
import { requireOwnedFolder } from "@/lib/decks/route-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

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
  const limited = await enforceRateLimit(
    RATE_LIMITS.folderMetaWrite(clientIp(request.headers), id),
  );
  if (limited) return limited;
  const access = await requireOwnedFolder(request.headers, id);
  if (access instanceof NextResponse) return access;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = PATCH_BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const [updated] = await getDb()
      .update(schema.deckFolders)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.deckFolders.id, access.folder.id))
      .returning();
    return NextResponse.json(
      { folder: folderMetaJson(updated, { isOwner: true }) },
      { headers: NO_STORE },
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "You already have a folder with that name." },
        { status: 409, headers: NO_STORE },
      );
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/folders/[id]">) {
  const { id } = await ctx.params;
  const limited = await enforceRateLimit(
    RATE_LIMITS.folderMetaWrite(clientIp(request.headers), id),
  );
  if (limited) return limited;
  const access = await requireOwnedFolder(request.headers, id);
  if (access instanceof NextResponse) return access;

  await getDb().delete(schema.deckFolders).where(eq(schema.deckFolders.id, access.folder.id));
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
