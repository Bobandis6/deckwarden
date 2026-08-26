/**
 * Client-side store for deck claim tokens (P1.2).
 *
 * The deck itself is server-side (build plan §4: guest building = anonymous
 * decks); localStorage holds ONLY the claim tokens, keyed by deck id. The
 * token is minted once by POST /api/decks and proves ownership via the
 * x-deck-token header until claim-on-OAuth (P2.1) consumes it.
 *
 * localStorage access is wrapped in try/catch: it throws in some private
 * modes and when storage is disabled, and a deck page must still render
 * (read-only) without it.
 */
const PREFIX = "deckwarden:deck-token:";

export function getDeckToken(deckId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + deckId);
  } catch {
    return null;
  }
}

export function setDeckToken(deckId: string, token: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(PREFIX + deckId, token);
    return true;
  } catch {
    return false;
  }
}
