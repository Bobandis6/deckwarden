/**
 * Anonymous-deck claim (P1.7 plumbing; goes live with Better Auth in P2.1).
 *
 * Claiming attaches user_id and NULLs claim_token — build plan §4: the token
 * is redeemed at first OAuth, after which ownership is the session, never the
 * token again. Verification reuses the exact isDeckOwner rules: only decks
 * that are still anonymous and whose token matches are claimed; everything
 * else is silently skipped (deleted decks, already-claimed decks, bad tokens).
 */
import { inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { isDeckOwner } from "@/lib/decks/access";

export interface ClaimCredential {
  id: string;
  token: string;
}

/** Claims every verifiable deck for `userId`; returns the claimed deck ids. */
export async function claimDecks(userId: string, creds: ClaimCredential[]): Promise<string[]> {
  if (creds.length === 0) return [];
  const tokenById = new Map(creds.map((c) => [c.id, c.token]));
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.decks)
    .where(inArray(schema.decks.id, [...tokenById.keys()]));

  const claimable = rows.filter((deck) => isDeckOwner(deck, tokenById.get(deck.id) ?? null));
  if (claimable.length === 0) return [];

  const ids = claimable.map((d) => d.id);
  await db
    .update(schema.decks)
    .set({ userId, claimToken: null })
    .where(inArray(schema.decks.id, ids));
  return ids;
}
