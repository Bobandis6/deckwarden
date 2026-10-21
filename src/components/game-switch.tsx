/**
 * GameSwitch (R1b, C6): the contextual Magic · One Piece switch above the
 * browse indexes' filters — /commanders ↔ /leaders — and, with its own
 * hrefs, /cards' game pills. Two Link pills in a nav labelled "Game" with
 * aria-current on the active game: the markup /cards has carried since
 * P4.4, now in one place. Links, not a client control — the game is a page,
 * not a state.
 *
 * U10b (WAVE5 D10): the pills are filter Chips, so the current game reads
 * like every other pressed filter (the muted fill and the accent ring, where
 * it was an inverted fill beside the color chips' ring) at the chips' 24 px.
 */
import Link from "next/link";

import { Chip } from "@/components/ui/chip";
import type { AdapterGameId } from "@/lib/games/registry";
import { cn } from "@/lib/utils";

/** The games with a browse index: the ones with an adapter (the registry's own list, S8 I7). */
export type SwitchGame = AdapterGameId;

export const GAME_SWITCH_LABELS: Record<SwitchGame, string> = {
  mtg: "Magic: The Gathering",
  optcg: "One Piece",
};

const ORDER: SwitchGame[] = ["mtg", "optcg"];

const INDEX_HREFS: Record<SwitchGame, string> = { mtg: "/commanders", optcg: "/leaders" };

export function GameSwitch({
  active,
  hrefs = INDEX_HREFS,
  className,
}: {
  active: SwitchGame;
  hrefs?: Record<SwitchGame, string>;
  className?: string;
}) {
  return (
    <nav aria-label="Game" className={cn("flex flex-wrap gap-1.5", className)}>
      {ORDER.map((game) => {
        const isActive = game === active;
        return (
          <Chip
            key={game}
            render={<Link href={hrefs[game]} />}
            aria-current={isActive ? "page" : undefined}
            pressed={isActive}
          >
            {GAME_SWITCH_LABELS[game]}
          </Chip>
        );
      })}
    </nav>
  );
}
