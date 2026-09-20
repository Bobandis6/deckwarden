"use client";

/**
 * The pick banner island on /commanders and /leaders (W4, WAVE2.md D3):
 * "Choosing a commander for '{deck}' · Back to deck · Cancel". Null server
 * snapshot (the index-view discipline) — the server HTML of both indexes
 * carries nothing, and the banner appears only after hydration when this
 * tab holds a fresh same-game pick intent. Cancel clears the intent (the
 * only clear besides apply — TTL covers abandonment).
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { clearPickIntent, usePickIntent } from "@/lib/decks/leader-pick-intent";
import type { GameId } from "@/lib/games/types";

export function LeaderPickBanner({ game, noun }: { game: GameId; noun: string }) {
  const intent = usePickIntent(game);
  if (!intent) return null;
  return (
    <div className="border-accent-game/40 bg-accent/40 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
      <span className="min-w-0">
        Choosing a {noun} for <span className="font-medium">“{intent.deckName}”</span>
      </span>
      <span className="flex items-center gap-3">
        <Link
          href={`/decks/${encodeURIComponent(intent.deckId)}/edit`}
          className="underline underline-offset-2"
        >
          Back to deck
        </Link>
        <Button variant="ghost" size="sm" onClick={clearPickIntent}>
          Cancel
        </Button>
      </span>
    </div>
  );
}
