/**
 * POST /api/decks/mine — batch-verify this browser's deck tokens (P1.7).
 *
 * The anonymous "your decks" list: the client sends every {id, token} pair
 * from its localStorage token store and gets back meta for the decks whose
 * token still verifies (deleted or claimed decks silently drop out). A POST,
 * not a GET, so tokens never appear in URLs. This is not an account: nothing
 * is stored, the response is derived purely from the proof the caller sent.
 *
 * Caching intent: force-dynamic + no-store — response is per-caller by
 * construction.
 */
import { inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { isDeckOwner } from "@/lib/decks/access";
import { deckMetaJson } from "@/lib/decks/serialize";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const BODY = z.object({
  decks: z
    .array(z.object({ id: z.uuid(), token: z.string().min(1).max(200) }))
    .min(1)
    .max(100),
});

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const tokenById = new Map(parsed.data.decks.map((d) => [d.id, d.token]));
  const rows = await getDb()
    .select()
    .from(schema.decks)
    .where(inArray(schema.decks.id, [...tokenById.keys()]));

  const decks = rows
    .filter((deck) => isDeckOwner(deck, tokenById.get(deck.id) ?? null))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((deck) => deckMetaJson(deck, { isOwner: true }));

  return NextResponse.json({ decks }, { headers: NO_STORE });
}
