"use client";

/**
 * The decks this browser holds claim tokens for (P1.7's fetch, extracted in
 * X1 so home's guest section and the signed-out account page share it): the
 * token store's keys enumerate them; POST /api/decks/mine verifies the
 * tokens server-side and returns meta (stale tokens for deleted decks
 * silently drop out) plus `leaderImage` — the first leader's `small`
 * rendition, null while a game's images are gated.
 *
 * Nothing is stored server-side for a guest — the list is derived from the
 * claim tokens in localStorage each visit, so it lands client-side after the
 * fetch and the server HTML carries nothing. null means "nothing to show":
 * before the fetch lands, with no tokens, and after any failure alike.
 */
import { useEffect, useState } from "react";

import type { DeckVisibility } from "@/db/schema";
import { listDeckTokens } from "@/lib/decks/token-store";

export interface BrowserDeck {
  id: string;
  publicId: string;
  game: string | null;
  format: string | null;
  name: string;
  visibility: DeckVisibility;
  updatedAt: string;
  ciMask: number;
  likesCount: number;
  leaderImage: string | null;
}

export function useBrowserDecks(): BrowserDeck[] | null {
  const [decks, setDecks] = useState<BrowserDeck[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const held = listDeckTokens();
    if (held.length === 0) return;
    void (async () => {
      try {
        // The API caps the batch at 100; more stale keys than that is
        // pathological, so the overflow is just dropped.
        const res = await fetch("/api/decks/mine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decks: held.slice(0, 100).map((h) => ({ id: h.deckId, token: h.token })),
          }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json: { decks: BrowserDeck[] } = await res.json();
        setDecks(json.decks);
      } catch {
        // Network failure or no storage: the section just doesn't render.
      }
    })();
    return () => controller.abort();
  }, []);

  return decks;
}
