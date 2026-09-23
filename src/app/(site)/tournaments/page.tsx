/**
 * /tournaments — the tournament index (W10, D9). Recent kept events per
 * game (top-16 standings at 16+ player events — the ingest bounds), newest
 * first, each row linking its internal event page with the winner's
 * leader(s) beside it. `?leader=<slug>` swaps the list for that leader's
 * whole run of kept finishes — the hub shelves' "All {n} finishes →"
 * target. `?game=` picks the corpus like /cards: tabs over one surface,
 * not separate routes.
 *
 * Caching intent: force-dynamic — the leader filter is query-driven and
 * the event list moves nightly; the page is one indexed read
 * (tournaments_game_date, or the ts_by_leader GIN when filtered) over a
 * tiny shell. The event pages under /tournaments/[id] are the cached half.
 *
 * Canonical story (the /cards precedent): the two game corpora are their
 * own canonicals — bare /tournaments for MTG, ?game=optcg for OP — and the
 * leader filter canonicalizes away. Sitemap lists the index only; the
 * event pages are noindex v1 (D9's explicit decision).
 */
import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GameSwitch } from "@/components/game-switch";
import { OptcgPostureLine } from "@/components/optcg-posture-line";
import {
  LeaderNames,
  leaderHubHref,
  type TournamentGame,
} from "@/components/tournaments/leader-names";
import { GAME_ID } from "@/db/seed-data";
import { getAdapter } from "@/lib/games/registry";
import { loadLeaderBySlug } from "@/lib/hub/queries";
import { eventDateLabel, ordinal } from "@/lib/tournaments/format";
import {
  ALL_FINISHES_CAP,
  loadRecentTournaments,
  loadTopFinishes,
  RECENT_EVENTS_SHOWN,
} from "@/lib/tournaments/queries";

export const dynamic = "force-dynamic";

function gameFrom(sp: Record<string, string | string[] | undefined>): TournamentGame {
  return sp.game === "optcg" ? "optcg" : "mtg";
}

export async function generateMetadata({
  searchParams,
}: PageProps<"/tournaments">): Promise<Metadata> {
  const game = gameFrom(await searchParams);
  if (game === "optcg") {
    return {
      title: "One Piece tournaments",
      description:
        "Recent One Piece Card Game tournament results — top-16 finishes at 16+ player events, from Limitless.",
      alternates: { canonical: "/tournaments?game=optcg" },
    };
  }
  return {
    title: "Tournaments",
    description:
      "Recent Commander tournament results — top-16 finishes at 16+ player events, from Topdeck.gg.",
    alternates: { canonical: "/tournaments" },
  };
}

export default async function TournamentsPage({ searchParams }: PageProps<"/tournaments">) {
  const sp = await searchParams;
  const game = gameFrom(sp);
  const gameId = game === "optcg" ? GAME_ID.optcg : GAME_ID.mtg;
  const adapter = getAdapter(game);
  const tournamentsMeta = adapter.capabilities.tournaments;
  const leaderSlug = typeof sp.leader === "string" ? sp.leader : "";
  const leaderWord = game === "mtg" ? "commander" : "leader";

  // The filtered view: one leader's whole run of kept finishes.
  const leader = leaderSlug ? await loadLeaderBySlug(gameId, leaderSlug) : null;
  if (leaderSlug && !leader) notFound();
  const finishes = leader ? await loadTopFinishes(gameId, leader.id, ALL_FINISHES_CAP) : null;
  const events = leader ? [] : await loadRecentTournaments(gameId);

  return (
    <main className="max-w-wide mx-auto w-full flex-1 px-4 py-8" data-game={game}>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Tournaments</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Top-16 results at 16+ player events
        {tournamentsMeta && (
          <>
            , from{" "}
            <a
              href={tournamentsMeta.sourceHref}
              className="underline"
              rel="noreferrer"
              target="_blank"
            >
              {tournamentsMeta.sourceLabel}
            </a>
          </>
        )}
        .
      </p>

      <GameSwitch
        active={game}
        hrefs={{ mtg: "/tournaments", optcg: "/tournaments?game=optcg" }}
        className="mt-3"
      />

      {leader && finishes && (
        <section aria-label={`Finishes for ${leader.name}`} className="mt-6 max-w-2xl">
          <h2 className="font-display text-xl font-semibold">
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
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {finishes.total > finishes.finishes.length
              ? `The ${finishes.finishes.length} most recent of ${finishes.total} finishes`
              : finishes.total === 1
                ? "One finish"
                : `${finishes.total} finishes`}{" "}
            with this {leaderWord}, newest first.{" "}
            <Link
              href={game === "mtg" ? "/tournaments" : "/tournaments?game=optcg"}
              className="underline"
            >
              All events
            </Link>
          </p>
          {finishes.total === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">
              No kept finishes for this {leaderWord} yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y rounded-lg border">
              {finishes.finishes.map((finish) => {
                const record =
                  finish.wins !== null && finish.losses !== null
                    ? `${finish.wins}–${finish.losses}–${finish.draws ?? 0}`
                    : null;
                return (
                  <li
                    key={`${finish.tournamentId}-${finish.placement}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="text-sm">
                        <span className="font-semibold tabular-nums">
                          {ordinal(finish.placement)}
                        </span>{" "}
                        <span className="text-muted-foreground">of {finish.playerCount}</span> —{" "}
                        <Link
                          href={`/tournaments/${finish.tournamentId}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {finish.eventName}
                        </Link>
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {eventDateLabel(finish.startDate)}
                        {record && <span title="wins–losses–draws"> · {record}</span>}
                        {finish.playerName && <> · by {finish.playerName}</>}
                      </span>
                    </span>
                    {finish.decklistUrl && (
                      <a
                        href={finish.decklistUrl}
                        className="shrink-0 text-xs underline"
                        rel="noreferrer nofollow"
                        target="_blank"
                      >
                        Decklist
                        <ArrowUpRightIcon
                          aria-hidden
                          className="ml-0.5 inline size-3.5 align-[-0.15em]"
                        />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!leader && (
        <section aria-label="Recent events" className="mt-6 max-w-2xl">
          {events.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">No kept events yet.</p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                The{" "}
                {events.length === 1 ? "most recent event" : `${events.length} most recent events`},
                newest first.
              </p>
              <ul className="mt-2 divide-y rounded-lg border">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="text-sm">
                        <Link
                          href={`/tournaments/${event.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {event.name}
                        </Link>{" "}
                        <span className="text-muted-foreground">· {event.playerCount} players</span>
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {eventDateLabel(event.startDate)}
                        {event.winners.length > 0 && (
                          <>
                            {" "}
                            · 1st: <LeaderNames game={game} leaders={event.winners} />
                          </>
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {events.length === RECENT_EVENTS_SHOWN && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Showing the {RECENT_EVENTS_SHOWN} most recent events.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {game === "optcg" && <OptcgPostureLine />}
    </main>
  );
}
