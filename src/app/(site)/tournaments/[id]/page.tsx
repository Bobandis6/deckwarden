/**
 * /tournaments/[id] — one event's kept standings (W10, D9): placement
 * order (the live contract, P3.8), player names as the source published
 * them, leader names linking their hubs with ColorChips, records, and the
 * external `Decklist ↗` link when the source carries one (card lists are
 * deliberately not stored — Neon budget). The event's own external link
 * rides the meta line — the hard attribution rule.
 *
 * Caching intent: ISR, revalidate daily — standings only move on ingest's
 * 14-day trailing re-fetch, no per-viewer state. Rendered on first
 * request, then cached: generateStaticParams returns [] (that's what makes
 * the revalidate real — LATER row 69). The 404 gate for junk ids lives in
 * this segment's layout, above the loading boundary (R6).
 *
 * SEO: `robots: { index: false }` — D9's explicit v1 decision (thin pages
 * carrying player names; recorded to revisit, not relitigate). The
 * /tournaments index is the indexable page.
 */
import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OptcgPostureLine } from "@/components/optcg-posture-line";
import { LeaderNames, type TournamentGame } from "@/components/tournaments/leader-names";
import { GAME_ID } from "@/db/seed-data";
import { getAdapter } from "@/lib/games/registry";
import { eventDateLabel, ordinal } from "@/lib/tournaments/format";

import { getEvent } from "./event";

export const revalidate = 86400;

// ISR needs this (LATER row 69, fired in R1b): `revalidate` alone renders on
// every request for a dynamic-params route. The route becomes ISR only when
// generateStaticParams exists, and an empty array means "nothing at build
// time, everything on first request, then cached for `revalidate`".
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/tournaments/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return { title: "Tournament", robots: { index: false } };
  return {
    title: event.name,
    description: `Top-16 standings from ${event.name} (${eventDateLabel(event.startDate)}, ${event.playerCount} players).`,
    robots: { index: false },
  };
}

export default async function TournamentEventPage({ params }: PageProps<"/tournaments/[id]">) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const game: TournamentGame = event.gameId === GAME_ID.optcg ? "optcg" : "mtg";
  const adapter = getAdapter(game);
  const tournamentsMeta = adapter.capabilities.tournaments;
  const leaderWord = game === "mtg" ? "Commander" : "Leader";
  const recordTitle = game === "mtg" ? "wins–losses–draws" : "wins–losses–ties";

  return (
    <main className="max-w-wide mx-auto w-full flex-1 px-4 py-8" data-game={game}>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{event.name}</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {eventDateLabel(event.startDate)} · {event.playerCount} players
        {event.topCut ? <> · top cut {event.topCut}</> : null}
        {tournamentsMeta && (
          <>
            {" "}
            · on{" "}
            <a
              href={tournamentsMeta.eventUrl(event.externalKey)}
              className="underline"
              rel="noreferrer"
              target="_blank"
            >
              {tournamentsMeta.sourceLabel}
              <ArrowUpRightIcon aria-hidden className="ml-0.5 inline size-3.5 align-[-0.15em]" />
            </a>
          </>
        )}
      </p>

      <div className="mt-6 max-w-2xl overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th scope="col" className="px-3 py-2 font-medium">
                #
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Player
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {leaderWord}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Record
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                List
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {event.standings.map((standing) => {
              const record =
                standing.wins !== null && standing.losses !== null
                  ? `${standing.wins}–${standing.losses}–${standing.draws ?? 0}`
                  : null;
              return (
                <tr key={standing.placement}>
                  <td className="px-3 py-2 font-semibold tabular-nums">
                    {ordinal(standing.placement)}
                  </td>
                  <td className="px-3 py-2">{standing.playerName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <LeaderNames game={game} leaders={standing.leaders} />
                  </td>
                  <td className="text-muted-foreground px-3 py-2 tabular-nums">
                    {record ? <span title={recordTitle}>{record}</span> : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {standing.decklistUrl ? (
                      <a
                        href={standing.decklistUrl}
                        className="underline"
                        rel="noreferrer nofollow"
                        target="_blank"
                      >
                        Decklist
                        <ArrowUpRightIcon
                          aria-hidden
                          className="ml-0.5 inline size-3.5 align-[-0.15em]"
                        />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tournamentsMeta && (
        <p className="text-muted-foreground mt-4 text-xs">
          Standings to placement 16 at 16+ player events. Results from{" "}
          <a
            href={tournamentsMeta.sourceHref}
            className="underline"
            rel="noreferrer"
            target="_blank"
          >
            {tournamentsMeta.sourceLabel}
          </a>
          . Player names appear as the source published them.
        </p>
      )}

      {game === "optcg" && <OptcgPostureLine />}
    </main>
  );
}
