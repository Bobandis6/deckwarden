/**
 * Card page: image, printings, prices, legality (P0.6).
 *
 * Caching intent: ISR, revalidate hourly — card data changes once nightly at
 * ingest, so pages are effectively static between runs. Rendered on demand
 * (no generateStaticParams; 35k cards would bloat the build for no reason).
 *
 * Game-agnostic by construction: everything game-flavored (cost pips, subtitle,
 * rules text, stat line) comes through the adapter's display contract.
 */
import { asc, desc, eq, isNull, and } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache as reactCache } from "react";

import { ComboList } from "@/components/combos/combo-list";
import { getDb, schema } from "@/db";
import { GAME_ID, GAMES } from "@/db/seed-data";
import { embeddablePrintingImageUrl } from "@/lib/cards/images";
import { COMBOS_SHOWN, loadCombosForCard } from "@/lib/combos/queries";
import { getAdapter } from "@/lib/games/registry";
import type { CardData } from "@/lib/games/types";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld";

export const revalidate = 3600;

const { cardIdentities, cardPrintings, sets, formats, legalities } = schema;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_STYLE: Record<string, string> = {
  legal: "bg-green-500/15 text-green-600 dark:text-green-400",
  banned: "bg-red-500/15 text-red-600 dark:text-red-400",
  restricted: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  not_legal: "bg-muted text-muted-foreground",
};

async function loadCard(id: string) {
  if (!UUID_RE.test(id)) return null;
  const db = getDb();
  const [identity] = await db.select().from(cardIdentities).where(eq(cardIdentities.id, id));
  if (!identity) return null;

  const [printings, formatRows, legalityRows] = await Promise.all([
    db
      .select({
        id: cardPrintings.id,
        setCode: sets.code,
        setName: sets.name,
        collectorNumber: cardPrintings.collectorNumber,
        rarity: cardPrintings.rarity,
        releasedAt: cardPrintings.releasedAt,
        isDefault: cardPrintings.isDefault,
        prices: cardPrintings.prices,
        imageOverride: cardPrintings.imageOverride,
        isRemoved: cardPrintings.isRemoved,
      })
      .from(cardPrintings)
      .innerJoin(sets, eq(sets.id, cardPrintings.setId))
      .where(eq(cardPrintings.cardIdentityId, id))
      .orderBy(desc(cardPrintings.releasedAt)),
    db.select().from(formats).where(eq(formats.gameId, identity.gameId)).orderBy(asc(formats.id)),
    db
      .select({ formatId: legalities.formatId, status: legalities.status })
      .from(legalities)
      .where(
        and(
          eq(legalities.cardIdentityId, id),
          isNull(legalities.effectiveTo),
          isNull(legalities.condition),
        ),
      ),
  ]);

  // Default (displayed) printing first; stable sort keeps release order within groups.
  printings.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return { identity, printings, formatRows, legalityRows };
}

// One DB lookup shared by generateMetadata and the page render (P2.6).
const getCard = reactCache(loadCard);

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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Cards", path: "/cards" },
          { name: identity.name, path: `/cards/${identity.id}` },
        ])}
      />
      <Link href="/cards" className="text-muted-foreground text-sm hover:underline">
        ← Card search
      </Link>

      <div className="mt-4 flex flex-col gap-8 md:flex-row">
        <div className="shrink-0">
          {imageUrl ? (
            // CDN hotlink, unoptimized by design (CLAUDE.md: Hobby image
            // quota). Full-card image keeps the artist/© line intact.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={identity.name}
              width={488}
              height={680}
              className="w-72 rounded-2xl shadow-lg"
            />
          ) : (
            <div className="bg-muted flex h-96 w-72 items-center justify-center rounded-2xl px-6 text-center text-sm">
              {defaultPrinting ? "Card image coming soon" : "No image"}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{identity.name}</h1>
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
            <p className="mt-2 inline-block rounded-md bg-amber-500/15 px-2 py-1 text-sm text-amber-600 dark:text-amber-400">
              Preview card — not legal until release
            </p>
          )}
          <div className="mt-4 whitespace-pre-wrap text-[0.95rem] leading-relaxed">
            {adapter.display.bodyText(card)}
          </div>
          {identity.isLeaderCandidate && identity.slug && (
            <p className="mt-3">
              <Link href={`/c/${identity.slug}`} className="text-sm underline">
                {adapter.display.leaderNoun} hub: staples, curve & budget picks →
              </Link>
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
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-1.5 pr-4 font-medium">Set</th>
                  <th className="py-1.5 pr-4 font-medium">#</th>
                  <th className="py-1.5 pr-4 font-medium">Rarity</th>
                  <th className="py-1.5 pr-4 font-medium">USD</th>
                  <th className="py-1.5 font-medium">Foil</th>
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
                      <td className="py-1.5 pr-4">{prices.usd ? `$${prices.usd}` : "—"}</td>
                      <td className="py-1.5">{prices.usd_foil ? `$${prices.usd_foil}` : "—"}</td>
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
        <p className="text-muted-foreground mt-12 text-xs">
          ©Eiichiro Oda/Shueisha, Toei Animation · ONE PIECE CARD GAME ©BANDAI. Deckwarden is
          unofficial fan content, not affiliated with or endorsed by Bandai, Shueisha, or Toei
          Animation. No official card-data API exists for the One Piece Card Game —{" "}
          <Link href="/legal#one-piece" className="underline">
            how we source this data
          </Link>
          .
        </p>
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
