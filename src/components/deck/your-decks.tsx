"use client";

/**
 * Continue building for a guest (P1.7's "your decks"; tiles since R5a): the
 * token store's keys enumerate every deck this browser owns; POST
 * /api/decks/mine verifies them server-side and returns meta (stale tokens
 * for deleted decks silently drop out) plus, since R5a, `leaderImage` — the
 * first leader's `small` rendition, null while a game's images are gated.
 * No account, nothing stored server-side — the list is derived from the
 * claim tokens in localStorage each visit, so it renders client-side after
 * the fetch and the server HTML carries nothing (a signed-in visitor gets
 * the server-rendered ContinueBuilding instead; the page picks one).
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { DeckTile, DeckTileGrid } from "@/components/deck/deck-tile";
import type { DeckVisibility } from "@/db/schema";
import { deckTileData } from "@/lib/decks/tiles";
import { listDeckTokens } from "@/lib/decks/token-store";

interface DeckMeta {
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

export function YourDecks() {
  const [decks, setDecks] = useState<DeckMeta[] | null>(null);

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
        const json: { decks: DeckMeta[] } = await res.json();
        setDecks(json.decks);
      } catch {
        // Network failure or no storage: the section just doesn't render.
      }
    })();
    return () => controller.abort();
  }, []);

  if (!decks || decks.length === 0) return null;

  // id: the site header's guest "My decks" link (/#your-decks) lands here (R1b).
  return (
    <section id="your-decks" aria-label="Continue building" className="w-full space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Continue building
      </h2>
      <DeckTileGrid>
        {decks.map((deck) => (
          <DeckTile
            key={deck.id}
            tile={deckTileData({
              href: `/decks/${deck.id}/edit`,
              name: deck.name,
              game: deck.game,
              formatCode: deck.format,
              visibility: deck.visibility,
              updatedAt: deck.updatedAt,
              likesCount: deck.likesCount,
              ciMask: deck.ciMask,
              leaderImage: deck.leaderImage,
            })}
            linkTitle={`Edit ${deck.name}`}
            actions={
              <Link
                href={`/d/${deck.publicId}`}
                className="text-muted-foreground text-xs hover:underline"
              >
                Share page
              </Link>
            }
          />
        ))}
      </DeckTileGrid>
    </section>
  );
}
