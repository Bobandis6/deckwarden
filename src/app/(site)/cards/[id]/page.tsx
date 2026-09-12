/**
 * Card page: image, printings, prices, legality (P0.6).
 *
 * Caching intent: ISR, revalidate hourly — card data changes once nightly at
 * ingest, so pages are effectively static between runs. Rendered on first
 * request, then cached: generateStaticParams returns [] (35k cards would
 * bloat the build for no reason) — and that empty export is what makes the
 * revalidate real (LATER row 69).
 *
 * Game-agnostic by construction: everything game-flavored (cost pips, subtitle,
 * rules text, stat line) comes through the adapter's display contract.
 *
 * R5b (G3): the accent band above the hero card — the gradient only, no
 * art: the full card IS the art here, a crop above it would be redundant,
 * and 35k card pages must not each pay a Scryfall call.
 */
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CardImage } from "@/components/cards/card-image";
import { ComboList } from "@/components/combos/combo-list";
import { OptcgPostureLine } from "@/components/optcg-posture-line";
import { SURFACE_BAND, SurfaceHeader } from "@/components/surface-header";
import { GAME_ID, GAMES } from "@/db/seed-data";
import { embeddablePrintingImageUrl } from "@/lib/cards/images";
import { COMBOS_SHOWN, loadCombosForCard } from "@/lib/combos/queries";
import { getAdapter } from "@/lib/games/registry";
import type { CardData } from "@/lib/games/types";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld";
import { cn } from "@/lib/utils";

// The 404 gate lives in ./layout.tsx (R6): one cached lookup, three readers.
import { getCard } from "./card";

export const revalidate = 3600;

// ISR needs this (LATER row 69, fired in R1b): `revalidate` alone renders on
// every request — Next treats a dynamic route as ISR only when
// generateStaticParams exists, and an empty array means "nothing at build
// time, everything on first request, then cached for `revalidate`". Looks
// unused; do not delete.
export function generateStaticParams() {
  return [];
}

// Light tints take the 800 shade (R6 contrast audit): the 700s measured
// 4.22:1 (amber) and 4.08:1 (green) on their /15 tints in the light theme;
// the 800s read 5.95:1 and 5.88:1. Dark keeps the 400s (8.3:1+).
const STATUS_STYLE: Record<string, string> = {
  legal: "bg-green-500/15 text-green-800 dark:text-green-400",
  banned: "bg-destructive/15 text-destructive",
  restricted: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  not_legal: "bg-muted text-muted-foreground",
};

export async function generateMetadata({ params }: PageProps<"/cards/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getCard(id);
  if (!data) return { title: "Card not found" };
  const attrs = data.identity.attrs as { type_line?: string };
  const typeLine = attrs.type_line ?? data.identity.primaryType;
  const description =
    data.identity.gameId === GAME_ID.optcg
      ? `${typeLine ? `${typeLine}. ` : ""}Card text, printings, and format legality for ${data.identity.name}.`
      : `${typeLine ? `${typeLine}. ` : ""}Printings, current prices, format legality, and Commander combos for ${data.identity.name}.`;
  return {
    title: data.identity.name,
    description,
    alternates: { canonical: `/cards/${id}` },
    openGraph: { title: data.identity.name, description, type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export default async function CardPage({ params }: PageProps<"/cards/[id]">) {
  const { id } = await params;
  const data = await getCard(id);
  if (!data) notFound();
  const { identity, printings, formatRows, legalityRows } = data;
  // Separate from loadCard so generateMetadata never pays for it. Section is
  // hidden outright at zero (cold-start rule) — most cards combo with nothing.
  const combosData = await loadCombosForCard(identity.id);

  const gameCode = GAMES.find((g) => g.id === identity.gameId)?.code ?? "mtg";
  const adapter = getAdapter(gameCode);
  const card: CardData = {
    id: identity.id,
    name: identity.name,
    externalKey: identity.externalKey,
    primaryType: identity.primaryType,
    costValue: identity.costValue,
    colorsMask: identity.colorsMask,
    ciMask: identity.ciMask,
    isLeaderCandidate: identity.isLeaderCandidate,
    isPreview: identity.isPreview,
    cheapestUsd: identity.cheapestUsd === null ? null : Number(identity.cheapestUsd),
    popularity: identity.popularity,
    attrs: identity.attrs as Record<string, unknown>,
    legality: [],
  };

  const defaultPrinting = printings.find((p) => p.isDefault) ?? printings[0];
  // null while the URL is one browsers refuse to embed (Bandai's CORP:
  // same-site) — the OP mirror's public domain flips this without a code change.
  const imageUrl = defaultPrinting ? embeddablePrintingImageUrl(defaultPrinting, "normal") : null;
  const statLine = adapter.display.statLine?.(card) ?? null;
  const statusByFormat = new Map(legalityRows.map((l) => [l.formatId, l.status]));

  return (
    <main className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game={gameCode}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Cards", path: "/cards" },
          { name: identity.name, path: `/cards/${identity.id}` },
        ])}
      />
      <Link href="/cards" className="text-muted-foreground text-sm hover:underline">
        <ArrowLeftIcon aria-hidden className="mr-1 inline size-4 align-[-0.2em]" />
        Card search
      </Link>

      {/* The accent band (R5b, G3) — gradient only; the card overlaps its lower edge. */}
      <SurfaceHeader className={cn("mt-4", SURFACE_BAND.card)} />
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <div className="relative -mt-20 shrink-0 md:-mt-24">
          <CardImage
            src={imageUrl}
            alt={identity.name}
            width={488}
            height={680}
            priority
            className="w-72 rounded-2xl shadow-lg"
            fallback={defaultPrinting ? "Card image coming soon" : "No image"}
          />
        </div>

        <div className="min-w-0 flex-1 md:pt-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{identity.name}</h1>
            <span
              className="text-lg"
              dangerouslySetInnerHTML={{ __html: adapter.display.costHtml(card) }}
            />
          </div>
          <p className="text-muted-foreground mt-1">
            {adapter.display.subtitle(card)}
            {statLine ? ` · ${statLine}` : ""}
          </p>
          {identity.isPreview && (
            <p className="mt-2 inline-block rounded-md bg-amber-500/15 px-2 py-1 text-sm text-amber-800 dark:text-amber-400">
              Preview card — not legal until release
            </p>
          )}
          <div className="mt-4 whitespace-pre-wrap text-[0.95rem] leading-relaxed">
            {adapter.display.bodyText(card)}
          </div>
          {identity.isLeaderCandidate && identity.slug && (
            <p className="mt-3">
              {/* Hub roots are per game (hub/queries.ts routing decision). */}
              {gameCode === "optcg" ? (
                <Link href={`/l/${identity.slug}`} className="text-sm underline">
                  {adapter.display.leaderNoun} hub: profile & deck building
                  <ArrowRightIcon aria-hidden className="ml-1 inline size-4 align-[-0.2em]" />
                </Link>
              ) : (
                <Link href={`/c/${identity.slug}`} className="text-sm underline">
                  {adapter.display.leaderNoun} hub: staples, curve & budget picks
                  <ArrowRightIcon aria-hidden className="ml-1 inline size-4 align-[-0.2em]" />
                </Link>
              )}
            </p>
          )}

          <h2 className="mt-8 text-lg font-semibold">Legality</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {formatRows.map((f) => {
              const status = statusByFormat.get(f.id) ?? f.defaultLegality;
              return (
                <li
                  key={f.id}
                  className={`rounded-md px-2 py-1 text-sm ${STATUS_STYLE[status] ?? ""}`}
                >
                  {f.name}: {status.replace("_", " ")}
                </li>
              );
            })}
          </ul>

          <h2 className="mt-8 text-lg font-semibold">Printings</h2>
          <div className="mt-2 overflow-x-auto">
            {/* No price columns for OP (P4.4): prices are 0/2,785 non-null —
                two all-dash columns would imply data we don't have. */}
            <table className={`w-full text-sm ${gameCode === "optcg" ? "" : "min-w-[28rem]"}`}>
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-1.5 pr-4 font-medium">Set</th>
                  <th className="py-1.5 pr-4 font-medium">#</th>
                  <th className="py-1.5 pr-4 font-medium">Rarity</th>
                  {gameCode !== "optcg" && (
                    <>
                      <th className="py-1.5 pr-4 font-medium">USD</th>
                      <th className="py-1.5 font-medium">Foil</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {printings.map((p) => {
                  const prices = (p.prices ?? {}) as Record<string, string>;
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-4">
                        {p.setName}
                        {p.isDefault && (
                          <span className="text-muted-foreground text-xs"> (shown)</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-4 uppercase">
                        {p.setCode} {p.collectorNumber}
                      </td>
                      <td className="py-1.5 pr-4 capitalize">{p.rarity ?? "—"}</td>
                      {gameCode !== "optcg" && (
                        <>
                          <td className="py-1.5 pr-4">{prices.usd ? `$${prices.usd}` : "—"}</td>
                          <td className="py-1.5">
                            {prices.usd_foil ? `$${prices.usd_foil}` : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {adapter.capabilities.combos && combosData.total > 0 && (
            <section aria-label="Combos" className="mt-8">
              <h2 className="text-lg font-semibold">Combos using this card</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {combosData.total > COMBOS_SHOWN
                  ? `The ${combosData.combos.length} most-played of ${combosData.total} combos`
                  : `${combosData.total === 1 ? "One combo" : `${combosData.total} combos`}`}{" "}
                featuring this card, from {adapter.capabilities.combos.sourceLabel}.
              </p>
              <ComboList
                combos={combosData.combos}
                combosMeta={adapter.capabilities.combos}
                anchorCardId={identity.id}
              />
            </section>
          )}
        </div>
      </div>

      {gameCode === "optcg" ? (
        // Attribution + the gray-zone posture (P4.1): the © line stays with the
        // card image (Bandai footer wording, verified 2026-09-03), same spirit
        // as the Scryfall artist/© rule; the full statement lives on /legal.
        <OptcgPostureLine />
      ) : (
        <p className="text-muted-foreground mt-12 text-xs">
          Card data and images courtesy of{" "}
          <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
            Scryfall
          </a>
          .
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
      )}
    </main>
  );
}
