/**
 * Deck ownership + read access (P1.1; session-aware since P2.1).
 *
 * Two proofs of ownership, mutually exclusive by construction: guest decks
 * (user_id NULL) authenticate writes with the claim_token issued once at
 * create, sent back as an `x-deck-token` header; claimed/account decks
 * (user_id set, claim_token NULLed) authenticate with the Better Auth session
 * — the token path is dead for them forever, so a leaked old token proves
 * nothing after claim.
 *
 * These functions stay pure: routes resolve the session user id (route-
 * helpers.ts / lib/auth.ts) and pass it in. claim_token is never serialized
 * back out; only the create response carries it.
 */
import { timingSafeEqual } from "node:crypto";

export const DECK_TOKEN_HEADER = "x-deck-token";

export interface DeckAccessRow {
  userId: string | null;
  claimToken: string | null;
  visibility: "public" | "unlisted" | "private";
}

export function deckTokenFrom(headers: Headers): string | null {
  return headers.get(DECK_TOKEN_HEADER);
}

/** Constant-time string compare (token guessing shouldn't get a timing oracle). */
function tokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function isDeckOwner(
  deck: DeckAccessRow,
  token: string | null,
  sessionUserId: string | null = null,
): boolean {
  if (deck.userId !== null) return sessionUserId !== null && deck.userId === sessionUserId;
  return deck.claimToken !== null && token !== null && tokenEquals(deck.claimToken, token);
}

/** Reads: owner always; everyone else only when the deck isn't private. */
export function canReadDeck(
  deck: DeckAccessRow,
  token: string | null,
  sessionUserId: string | null = null,
): boolean {
  return deck.visibility !== "private" || isDeckOwner(deck, token, sessionUserId);
}

/** Best-effort client IP for decks.created_ip (anon spam control / purge policy). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
