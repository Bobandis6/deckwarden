"use client";

/**
 * Anonymous "your decks" list (P1.7): the token store's keys enumerate every
 * deck this browser owns; POST /api/decks/mine verifies them server-side and
 * returns meta (stale tokens for deleted decks silently drop out). No
 * account, nothing stored server-side — the list is derived from the claim
 * tokens in localStorage each visit.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import type { DeckVisibility } from "@/components/editor/share-dialog";
import { listDeckTokens } from "@/lib/decks/token-store";
import { getAdapter } from "@/lib/games/registry";
import type { GameId } from "@/lib/games/types";

interface DeckMeta {
  id: string;
  publicId: string;
  game: GameId | null;
  format: string | null;
  name: string;
  visibility: DeckVisibility;
  updatedAt: string;
}

function formatLabel(deck: DeckMeta): string {
  if (!deck.game) return deck.format ?? "";
  const label = getAdapter(deck.game).formats.find((f) => f.code === deck.format)?.label;
  return label ?? deck.format ?? "";
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

  return (
    <section aria-label="Your decks" className="w-full max-w-md">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Your decks on this browser
      </h2>
      <ul className="mt-2 divide-y rounded-lg border">
        {decks.map((deck) => (
          <li key={deck.id} className="flex items-center gap-3 px-3 py-2">
            <Link
              href={`/decks/${deck.id}/edit`}
              className="min-w-0 flex-1 hover:underline"
              title={`Edit ${deck.name}`}
            >
              <span className="block truncate text-sm font-medium">{deck.name}</span>
              <span className="text-muted-foreground block text-xs">
                {formatLabel(deck)} · Updated{" "}
                {new Date(deck.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </Link>
            <Link
              href={`/d/${deck.publicId}`}
              className="text-muted-foreground shrink-0 text-xs hover:underline"
            >
              Share page
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
