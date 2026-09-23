/**
 * Leader names as the tournament surfaces render them (W10, D9): each name
 * links its hub when slugged (/c/ for Magic, /l/ for One Piece) with its
 * ColorChips beside it; partner pairs join with a dot. Server-safe — the
 * index rows and the event standings table share this one copy.
 */
import Link from "next/link";

import { ColorChipList } from "@/components/color-chip";
import type { EventLeaderRef } from "@/lib/tournaments/queries";

export type TournamentGame = "mtg" | "optcg";

/** The game's hub root — the routing decision of hub/queries.ts, not re-derived. */
export function leaderHubHref(game: TournamentGame, slug: string): string {
  return game === "mtg" ? `/c/${slug}` : `/l/${slug}`;
}

export function LeaderNames({
  game,
  leaders,
}: {
  game: TournamentGame;
  leaders: EventLeaderRef[];
}) {
  return (
    <>
      {leaders.map((leader, i) => (
        <span key={`${leader.name}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span aria-hidden>·</span>}
          {leader.slug ? (
            <Link
              href={leaderHubHref(game, leader.slug)}
              className="underline-offset-2 hover:underline"
            >
              {leader.name}
            </Link>
          ) : (
            leader.name
          )}
          <ColorChipList game={game} mask={leader.colorsMask} />
        </span>
      ))}
    </>
  );
}
