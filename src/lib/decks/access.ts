/**
 * Deck ownership + read access (P1.1).
 *
 * Guest decks authenticate writes with the claim_token issued once at create,
 * sent back as an `x-deck-token` header. Session users arrive with Better Auth
 * (P2.1) — until then a deck with user_id set has no way to prove ownership
 * over the API, which is correct: no such decks can exist yet.
 *
 * claim_token is never serialized back out; only the create response carries it.
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

export function isDeckOwner(deck: DeckAccessRow, token: string | null): boolean {
  if (deck.userId !== null) return false; // session auth lands P2.1
  return deck.claimToken !== null && token !== null && tokenEquals(deck.claimToken, token);
}

/** Reads: owner always; everyone else only when the deck isn't private. */
export function canReadDeck(deck: DeckAccessRow, token: string | null): boolean {
  return deck.visibility !== "private" || isDeckOwner(deck, token);
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
