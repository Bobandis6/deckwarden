/**
 * GameSwitch (R1b, C6): the contextual Magic · One Piece switch above the
 * browse indexes' filters — /commanders ↔ /leaders — and, with its own
 * hrefs, /cards' game pills. Two Link pills in a nav labelled "Game" with
 * aria-current on the active game: the markup /cards has carried since
 * P4.4, now in one place. Links, not a client control — the game is a page,
 * not a state.
 */
import Link from "next/link";

import { cn } from "@/lib/utils";

/** The two games with browse indexes today — GameId also declares azuki, which has none. */
export type SwitchGame = "mtg" | "optcg";

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
          <Link
            key={game}
            href={hrefs[game]}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center rounded-md border px-2 py-1 text-sm pointer-coarse:min-h-11 pointer-coarse:px-3 ${isActive ? "bg-foreground text-background" : "hover:underline"}`}
          >
            {GAME_SWITCH_LABELS[game]}
          </Link>
        );
      })}
    </nav>
  );
}
