"use client";

/**
 * The hub page's build CTA island (W4, WAVE2.md D3): the server render is
 * EXACTLY today's anchor — "Build with this commander / leader" →
 * /decks/new?game=…&leader=… — because the hub pages are ISR and the smokes
 * grep that markup (hubs-smoke:103-108, seo-smoke:339-343). The pick intent
 * is read through useSyncExternalStore with a null server snapshot (the
 * index-view discipline), so a fresh same-game intent adds the primary
 * "Use for '{deck}'" → /decks/<id>/edit?leader=<key> only after hydration.
 * Never `useSearchParams` here — that would flip the ISR pages dynamic.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { usePickIntent } from "@/lib/decks/leader-pick-intent";
import type { GameId } from "@/lib/games/types";

export function HubBuildCta({
  game,
  leaderKey,
  label,
  autofill = false,
}: {
  game: GameId;
  /** The leader's external key — resolve's pass 0 seeds/applies by it. */
  leaderKey: string;
  /** "Build with this commander" / "Build with this leader" (smoke-pinned). */
  label: string;
  /**
   * The adapter's `recommend.autofill` gate (W9c): adds the "Start with a
   * starter shell" row — same draft link plus `&autofill=1`, which the
   * chooser latches and the editor turns into an opened review sheet after
   * the leader seed lands (never an auto-apply). Additive only: the pinned
   * anchors above never change.
   */
  autofill?: boolean;
}) {
  const intent = usePickIntent(game);
  return (
    <>
      {intent && (
        <Button
          nativeButton={false}
          render={
            <Link href={`/decks/${encodeURIComponent(intent.deckId)}/edit?leader=${leaderKey}`} />
          }
        >
          Use for “{intent.deckName}”
        </Button>
      )}
      <Button
        nativeButton={false}
        render={<Link href={`/decks/new?game=${game}&leader=${leaderKey}`} />}
      >
        {label}
      </Button>
      {autofill && (
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/decks/new?game=${game}&leader=${leaderKey}&autofill=1`} />}
        >
          Start with a starter shell
        </Button>
      )}
    </>
  );
}
