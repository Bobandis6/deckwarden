/**
 * /c/[slug] — the Commander hub page (P2.4, hub v1a).
 *
 * Cold-start rule (plan §1): everything here is honestly good with zero
 * users — staples ranked by Scryfall's edhrec_rank for the leader's color
 * identity, a curve computed from those staples, budget tiers from current
 * prices, and an editorial role template clearly labeled as a template.
 * No community shelves until community decks exist (P2.5+ decides that).
 *
 * Caching intent: ISR, revalidate hourly, same reasoning as card pages —
 * card data changes once nightly at ingest and the page has no per-viewer
 * state (the budget toggle filters client-side for exactly this reason).
 * Rendered on demand; ~4k leaders would bloat the build for nothing.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ComboList } from "@/components/combos/combo-list";
import { AnalyticsBlocks } from "@/components/deck/analytics-blocks";
import { StaplesTable } from "@/components/hub/staples-table";
import { printingImageUrl } from "@/lib/cards/images";
import { COMBOS_SHOWN, loadCombosForCard } from "@/lib/combos/queries";
import { updatedLabel } from "@/lib/decks/display";
import { ciPipsHtml } from "@/lib/games/colors";
import { getAdapter } from "@/lib/games/registry";
import type { CardData } from "@/lib/games/types";
import { staplesCurveBlock } from "@/lib/hub/curve";
import {
  loadDefaultPrinting,
  loadHubDecks,
  loadLeaderBySlug,
  loadLeaderStatus,
  loadStaples,
  STAPLES_LIMIT,
} from "@/lib/hub/queries";

export const revalidate = 3600;

const getLeader = cache(loadLeaderBySlug);

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const leader = await getLeader(slug);
  if (!leader) return { title: "Commander" };
  const title = `${leader.name} — Commander hub`;
  const description = `Staples, curve, and budget picks for ${leader.name} Commander decks.`;
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function CommanderHubPage({ params }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const leader = await getLeader(slug);
  if (!leader) notFound();

  const [printing, status, staples, combosData, hubDecks] = await Promise.all([
    loadDefaultPrinting(leader.id),
    loadLeaderStatus(leader.id),
    loadStaples(leader),
    // Only combos a deck with THIS commander could actually run (CI fit).
    loadCombosForCard(leader.id, { fitCiMask: leader.ciMask }),
    loadHubDecks(leader.id),
  ]);

  const adapter = getAdapter("mtg");
  const card: CardData = {
    id: leader.id,
    name: leader.name,
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
  const curve = staplesCurveBlock(staples);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Link href="/commanders" className="text-muted-foreground text-sm hover:underline">
        ← Commanders
      </Link>

      <div className="mt-4 flex flex-col gap-8 md:flex-row">
        <div className="shrink-0">
          {printing ? (
            // Scryfall CDN hotlink, unoptimized by design (CLAUDE.md: Hobby image
            // quota). Full-card image keeps the artist/© line intact.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={printingImageUrl(printing, "normal")}
              alt={leader.name}
              width={488}
              height={680}
              className="w-72 rounded-2xl shadow-lg"
            />
          ) : (
            <div className="bg-muted flex h-96 w-72 items-center justify-center rounded-2xl">
              No image
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{leader.name}</h1>
            <span dangerouslySetInnerHTML={{ __html: ciPipsHtml(leader.ciMask) }} />
          </div>
          <p className="text-muted-foreground mt-1">
            {adapter.display.subtitle(card)}
            {leader.cheapestUsd !== null ? ` · from $${leader.cheapestUsd}` : ""}
          </p>
          {status !== "legal" && (
            <p className="mt-2 inline-block rounded-md bg-red-500/15 px-2 py-1 text-sm text-red-600 dark:text-red-400">
              {status === "banned"
                ? "Banned in Commander — shown for reference"
                : "Not legal in Commander"}
            </p>
          )}
          <div className="mt-4 text-[0.95rem] leading-relaxed whitespace-pre-wrap">
            {adapter.display.bodyText(card)}
          </div>
          <p className="mt-3">
            <Link href={`/cards/${leader.id}`} className="text-sm underline">
              Card details, printings & prices →
            </Link>
          </p>

          {adapter.hub && (
            <section aria-label="Deck template" className="mt-8">
              <h2 className="text-lg font-semibold">{adapter.hub.templateTitle}</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                A starting template, not a rule — counts to fill in around the commander.
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {adapter.hub.roles.map((role) => (
                  <li key={role.label} className="rounded-lg border px-3 py-2">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{role.label}</span>
                      <span className="text-lg font-semibold tabular-nums">{role.count}</span>
                    </span>
                    {role.hint && (
                      <span className="text-muted-foreground block text-xs">{role.hint}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <section aria-label="Staples" className="mt-10">
        <h2 className="text-lg font-semibold">Staples in these colors</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          The {STAPLES_LIMIT} most-played cards that fit this color identity, ranked by EDHREC play
          data via Scryfall.
        </p>
        {staples.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            No ranked staples for this color identity yet.
          </p>
        ) : (
          <StaplesTable
            staples={staples.map((s) => ({
              id: s.id,
              name: s.name,
              primaryType: s.primaryType,
              costValue: s.costValue,
              cheapestUsd: s.cheapestUsd,
            }))}
          />
        )}
      </section>

      {curve && (
        <section aria-label="Staples curve" className="mt-8 max-w-xl">
          <AnalyticsBlocks blocks={[curve]} />
        </section>
      )}

      {/* Cold-start rule: both shelves render only with real rows — never padding. */}
      {combosData.total > 0 && (
        <section aria-label="Combos" className="mt-10">
          <h2 className="text-lg font-semibold">Combos with {leader.name}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {combosData.total > COMBOS_SHOWN
              ? `The ${combosData.combos.length} most-played of ${combosData.total} combos`
              : `${combosData.total === 1 ? "One combo" : `${combosData.total} combos`}`}{" "}
            using this commander that fit its color identity, from Commander Spellbook.
          </p>
          <ComboList combos={combosData.combos} anchorCardId={leader.id} />
        </section>
      )}

      {hubDecks.length > 0 && (
        <section aria-label="Decks with this commander" className="mt-10 max-w-2xl">
          <h2 className="text-lg font-semibold">Decks with this commander</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Public Deckwarden decks running {leader.name}.
          </p>
          <ul className="mt-2 divide-y rounded-lg border">
            {hubDecks.map((deck) => (
              <li key={deck.publicId}>
                <Link
                  href={`/d/${deck.publicId}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:underline"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{deck.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      Updated {updatedLabel(deck.updatedAt)}
                    </span>
                  </span>
                  {deck.likesCount > 0 && (
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      ♥ {deck.likesCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-muted-foreground mt-12 text-xs">
        Card data and images courtesy of{" "}
        <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
          Scryfall
        </a>
        ; play-rate ranking from EDHREC data included in Scryfall bulk.
        {combosData.total > 0 && (
          <>
            {" "}
            Combo data courtesy of{" "}
            <a
              href="https://commanderspellbook.com"
              className="underline"
              rel="noreferrer"
              target="_blank"
            >
              Commander Spellbook
            </a>
            .
          </>
        )}{" "}
        Deckwarden is unofficial Fan Content and is not endorsed by Wizards of the Coast.
      </p>
    </main>
  );
}
