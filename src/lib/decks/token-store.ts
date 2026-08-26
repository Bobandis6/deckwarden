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

/**
 * Client-side mirror of access.ts's DECK_TOKEN_HEADER — that module is
 * server-only (node:crypto), so client components import the name from here.
 */
export const DECK_TOKEN_HEADER = "x-deck-token";

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

/**
 * Every deck this browser holds a claim token for (P1.7's "your decks" list;
 * P2.1's claim-on-OAuth flow reads the same set). Order is storage order —
 * callers sort by server-side metadata.
 */
export function listDeckTokens(): { deckId: string; token: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const out: { deckId: string; token: string }[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const token = window.localStorage.getItem(key);
      if (token) out.push({ deckId: key.slice(PREFIX.length), token });
    }
    return out;
  } catch {
    return [];
  }
}
