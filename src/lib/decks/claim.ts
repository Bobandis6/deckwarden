/**
 * Anonymous-deck claim (P1.7 plumbing; live with Better Auth since P2.1).
 *
 * Claiming attaches user_id and NULLs claim_token — build plan §4: the token
 * is redeemed at first OAuth, after which ownership is the session, never the
 * token again. Verification reuses the exact isDeckOwner rules: only decks
 * that are still anonymous and whose token matches are claimed; everything
 * else is silently skipped (deleted decks, already-claimed decks, bad tokens).
 *
 * S3 (SECURITY-AUDIT-report.md L6): the write is conditional per row. The
 * select-then-update it replaced checked the token in JavaScript and then ran
 * an unconditional UPDATE … WHERE id IN (…), so two redemptions of one leaked
 * token racing each other both succeeded and the second overwrote the first.
 * Now each row's UPDATE carries its own proof — `user_id IS NULL AND
 * claim_token = <the token that verified>` — and the claimed ids are the rows
 * the UPDATE actually returned, so a racer that lost gets nothing and the
 * first claimant keeps the deck. The JavaScript check stays in front: it is
 * the constant-time compare (a timing oracle on a token is still an oracle),
 * and it keeps a malformed token out of the statement — `claim_token` is a
 * uuid column, Postgres would throw on a value that is not one, and the zod
 * body allows any string up to 200 characters.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";

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
    .select({
      id: schema.decks.id,
      userId: schema.decks.userId,
      claimToken: schema.decks.claimToken,
      visibility: schema.decks.visibility,
    })
    .from(schema.decks)
    .where(inArray(schema.decks.id, [...tokenById.keys()]));

  // The rows whose offered token verifies, each paired with that token.
  const claimable = rows.flatMap((deck) => {
    const token = tokenById.get(deck.id) ?? null;
    return token !== null && isDeckOwner(deck, token) ? [{ id: deck.id, token }] : [];
  });
  if (claimable.length === 0) return [];

  const claimed = await db
    .update(schema.decks)
    .set({ userId, claimToken: null })
    .where(
      or(
        ...claimable.map(({ id, token }) =>
          and(
            eq(schema.decks.id, id),
            isNull(schema.decks.userId),
            eq(schema.decks.claimToken, token),
          ),
        ),
      ),
    )
    .returning({ id: schema.decks.id });
  return claimed.map((row) => row.id);
}
