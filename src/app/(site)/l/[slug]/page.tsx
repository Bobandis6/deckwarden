/**
 * /l/[slug] — the One Piece leader hub (P4.4). The routing decision lives in
 * hub/queries.ts's header: OP hubs get their own root instead of /c/ because
 * the vocabulary differs and MTG's 4k /c/ URLs must not move.
 *
 * Cold-start composition (adapter contract types.ts: optcg ships no
 * `hub` capability, so hubs show CARD DATA ONLY): leader art, colors, life,
 * traits, effect text, namesake cross-links, and browse links into /cards —
 * plus the build CTA. Deliberately NO staples/budget/combos/deck sections:
 * those signals are MTG-only today (popularity and prices are all-NULL for
 * OP, no Spellbook analogue), and the cold-start rule (plan §1) bans
 * rendering empty or faked shelves. Real deck shelves return the day real
 * OP decks exist — the counter runs.
 *
 * P4.5 adds the one shelf that is NOT user data and never pretends to be:
 * "Top finishes" from the Limitless ingest — source-attributed EXTERNAL
 * tournament results, the same distinction /c/ hubs draw. It renders only
 * when rows exist; a leader with none gets exactly the P4.4 page.
 *
 * Caching intent: ISR, revalidate hourly — same reasoning as /c/[slug]:
 * card data changes once nightly, no per-viewer state, rendered on first
 * request then cached (generateStaticParams [] makes the revalidate real —
 * LATER row 69).
 *
 * R5b (REDESIGN.md §2 "Hubs", G3): the accent band above the hero card. The
 * art goes through R2's adapter gate, which answers null for One Piece
 * before any network (§3: off until Bandai answers) — the gradient alone,
 * zero art requests; flipping the adapter flag later lights the banner
 * with no change here. The build CTA, its words and its href are
 * smoke-pinned and unchanged.
 */
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CardImage } from "@/components/cards/card-image";
import { chipsForMask, ColorChip } from "@/components/color-chip";
import { SurfaceHeader } from "@/components/surface-header";
import { Button } from "@/components/ui/button";
import { FORMAT_ID, GAME_ID } from "@/db/seed-data";
import { resolveCardArt } from "@/lib/cards/art";
import { embeddablePrintingImageUrl } from "@/lib/cards/images";
import { getAdapter } from "@/lib/games/registry";
import type { CardData } from "@/lib/games/types";
import type { OptcgAttrs } from "@/lib/games/optcg/adapter";
import { maskToOptcgColorNames, maskToOptcgLetters } from "@/lib/games/optcg/colors";
import { MIN_EVENT_PLAYERS, TOP_PLACEMENT } from "@/lib/games/optcg/limitless-map";
import { loadDefaultPrinting, loadLeaderStatus, loadOpLeaderSiblings } from "@/lib/hub/queries";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { loadTopFinishes, TOP_FINISHES_SHOWN } from "@/lib/tournaments/queries";

/** 1 → "1st", 12 → "12th" — placements only ever hit 1..16 (the /c/ helper, mirrored). */
function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}

/** "2026-08-30" → "Aug 30, 2026", pinned to UTC so the date column never shifts a day. */
function eventDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const revalidate = 3600;

// ISR needs this (LATER row 69, fired in R1b): `revalidate` alone renders on
// every request — Next treats a dynamic route as ISR only when
// generateStaticParams exists, and an empty array means "nothing at build
// time, everything on first request, then cached for `revalidate`". Looks
// unused; do not delete.
export function generateStaticParams() {
  return [];
}

// The 404 gate lives in ./layout.tsx (R6): one cached lookup, three readers.
import { getLeader } from "./leader";

export async function generateMetadata({ params }: PageProps<"/l/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const leader = await getLeader(slug);
  if (!leader) return { title: "Leader" };
  // The external key is part of the title on purpose: 17 Monkey.D.Luffys are
  // 17 different leaders, and the key is how OP players tell them apart.
  const colors = maskToOptcgColorNames(leader.colorsMask).join("/");
  const title = `${leader.name} (${leader.externalKey}) — One Piece Leader`;
  const description = `${colors} leader for the One Piece Card Game: life, traits, effect text, and deck building for ${leader.name} (${leader.externalKey}).`;
  return {
    title,
    description,
    alternates: { canonical: `/l/${slug}` },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LeaderHubPage({ params }: PageProps<"/l/[slug]">) {
  const { slug } = await params;
  const leader = await getLeader(slug);
  if (!leader) notFound();

  const adapter = getAdapter("optcg");
  const [[printing, art], status, siblings, topFinishes] = await Promise.all([
    // The banner's art through the adapter gate (R5b): null for One Piece
    // before any lookup — the gradient alone, no request.
    loadDefaultPrinting(leader.id).then(
      async (p) => [p, p ? await resolveCardArt(adapter, p.id) : null] as const,
    ),
    loadLeaderStatus(FORMAT_ID.optcgStandard, leader.id),
    loadOpLeaderSiblings(leader.name, leader.id),
    loadTopFinishes(GAME_ID.optcg, leader.id),
  ]);

  const tournamentsMeta = adapter.capabilities.tournaments;
  const card: CardData = {
    id: leader.id,
    name: leader.name,
    externalKey: leader.externalKey,
    primaryType: leader.primaryType,
    costValue: leader.costValue,
    colorsMask: leader.colorsMask,
    ciMask: leader.ciMask,
    isLeaderCandidate: leader.isLeaderCandidate,
    isPreview: leader.isPreview,
    cheapestUsd: leader.cheapestUsd === null ? null : Number(leader.cheapestUsd),
    popularity: leader.popularity,
    attrs: leader.attrs as Record<string, unknown>,
    legality: [],
  };
  const attrs = leader.attrs as OptcgAttrs;
  const imageUrl = printing ? embeddablePrintingImageUrl(printing, "normal") : null;
  const statLine = adapter.display.statLine?.(card) ?? null;
  const colorNames = maskToOptcgColorNames(leader.colorsMask);
  const colorLetters = maskToOptcgLetters(leader.colorsMask);
  const traits = attrs.traits ?? [];

  return (
    <main className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game="optcg">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "One Piece Leaders", path: "/leaders" },
          { name: `${leader.name} (${leader.externalKey})`, path: `/l/${slug}` },
        ])}
      />
      <Link href="/leaders" className="text-muted-foreground text-sm hover:underline">
        <ArrowLeftIcon aria-hidden className="mr-1 inline size-4 align-[-0.2em]" />
        One Piece Leaders
      </Link>

      {/* The accent band (R5b, G3); the hero card overlaps its lower edge. */}
      <SurfaceHeader art={art} className="mt-4" />
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <div className="relative -mt-24 shrink-0 md:-mt-28">
          <CardImage
            src={imageUrl}
            alt={leader.name}
            width={488}
            height={680}
            priority
            className="w-72 rounded-2xl shadow-lg"
            fallback="Card image coming soon"
          />
        </div>

        <div className="min-w-0 flex-1 md:pt-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{leader.name}</h1>
            <span className="text-muted-foreground text-lg tabular-nums uppercase">
              {leader.externalKey}
            </span>
          </div>
          <p className="text-muted-foreground mt-1">
            {adapter.display.subtitle(card)}
            {statLine ? ` · ${statLine}` : ""}
          </p>

          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {/* R5b: the shared ColorChip (C14) replaces the hand-rolled dots. */}
            {chipsForMask("optcg", leader.colorsMask).map((def) => (
              <ColorChip
                key={def.key}
                game="optcg"
                color={def.key}
                showLabel
                className="rounded-md border px-2 py-0.5"
              />
            ))}
            {status !== "legal" && (
              <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-destructive">
                {status.replace("_", " ")} in Standard
              </span>
            )}
          </p>

          <div className="mt-4 whitespace-pre-wrap text-[0.95rem] leading-relaxed">
            {adapter.display.bodyText(card)}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* ?leader= makes the button's words true (P4.6): the editor
                opens with this leader already in the leader zone (still a
                draft — no server row until the first real edit). */}
            <Button
              nativeButton={false}
              render={<Link href={`/decks/new?game=optcg&leader=${leader.externalKey}`} />}
            >
              Build with this leader
            </Button>
            <Link href={`/cards/${leader.id}`} className="text-sm underline">
              Card details, printings & legality
              <ArrowRightIcon aria-hidden className="ml-1 inline size-4 align-[-0.2em]" />
            </Link>
          </div>

          <h2 className="mt-8 text-lg font-semibold">Find cards for this deck</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            A {colorNames.join("/")} leader builds from {colorNames.join(" and ")} cards.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            <li>
              <Link
                href={`/cards?game=optcg&color=within:${colorLetters}`}
                className="rounded-md border px-2 py-1 underline-offset-2 hover:underline"
              >
                Browse {colorNames.join("/")} cards
              </Link>
            </li>
            {traits.map((trait) => (
              <li key={trait}>
                <Link
                  href={`/cards?game=optcg&traits=${encodeURIComponent(trait)}`}
                  className="rounded-md border px-2 py-1 underline-offset-2 hover:underline"
                >
                  {trait} cards
                </Link>
              </li>
            ))}
          </ul>

          {siblings.length > 0 && (
            <section aria-label={`Other ${leader.name} leaders`} className="mt-8">
              <h2 className="text-lg font-semibold">Other {leader.name} leaders</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Same character, different card — each is its own archetype.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/l/${s.slug}`}
                      className="rounded-md border px-2 py-1 underline-offset-2 hover:underline"
                    >
                      <span className="tabular-nums uppercase">{s.externalKey}</span>
                      {" · "}
                      {maskToOptcgColorNames(s.colorsMask).join("/")}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* Cold-start rule: renders only with real rows — a leader with none gets the P4.4 page. */}
      {tournamentsMeta && topFinishes.total > 0 && (
        <section aria-label="Top finishes" className="mt-10 max-w-2xl">
          <h2 className="text-lg font-semibold">Top finishes</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {topFinishes.total > TOP_FINISHES_SHOWN
              ? `The ${TOP_FINISHES_SHOWN} most recent of ${topFinishes.total} finishes`
              : topFinishes.total === 1
                ? "One finish"
                : `${topFinishes.total} finishes`}{" "}
            placing top {TOP_PLACEMENT} at {MIN_EVENT_PLAYERS}+ player events with this leader.
            Results from{" "}
            <a
              href={tournamentsMeta.sourceHref}
              className="underline"
              rel="noreferrer"
              target="_blank"
            >
              {tournamentsMeta.sourceLabel}
            </a>
            .
          </p>
          <ul className="mt-2 divide-y rounded-lg border">
            {topFinishes.finishes.map((finish) => {
              // draws stores the source's `ties` — OP terminology on an OP shelf.
              const record =
                finish.wins !== null && finish.losses !== null
                  ? `${finish.wins}–${finish.losses}–${finish.draws ?? 0}`
                  : null;
              return (
                <li
                  key={`${finish.externalKey}-${finish.placement}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="text-sm">
                      <span className="font-semibold tabular-nums">
                        {ordinal(finish.placement)}
                      </span>{" "}
                      <span className="text-muted-foreground">of {finish.playerCount}</span> —{" "}
                      <a
                        href={tournamentsMeta.eventUrl(finish.externalKey)}
                        className="font-medium underline-offset-2 hover:underline"
                        rel="noreferrer"
                        target="_blank"
                      >
                        {finish.eventName}
                        <ArrowUpRightIcon
                          aria-hidden
                          className="ml-0.5 inline size-3.5 align-[-0.15em]"
                        />
                      </a>
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {eventDateLabel(finish.startDate)}
                      {record && <span title="wins–losses–ties"> · {record}</span>}
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
        </section>
      )}

      <p className="text-muted-foreground mt-12 text-xs">
        ©Eiichiro Oda/Shueisha, Toei Animation · ONE PIECE CARD GAME ©BANDAI. Deckwarden is
        unofficial fan content, not affiliated with or endorsed by Bandai, Shueisha, or Toei
        Animation. No official card-data API exists for the One Piece Card Game —{" "}
        <Link href="/legal#one-piece" className="underline">
          how we source this data
        </Link>
        .
        {tournamentsMeta && topFinishes.total > 0 && (
          <>
            {" "}
            Tournament results courtesy of{" "}
            <a
              href={tournamentsMeta.sourceHref}
              className="underline"
              rel="noreferrer"
              target="_blank"
            >
              {tournamentsMeta.sourceLabel}
            </a>
            .
          </>
        )}
      </p>
    </main>
  );
}
