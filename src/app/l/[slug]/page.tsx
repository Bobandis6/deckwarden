/**
 * /l/[slug] — the One Piece leader hub (P4.4). The routing decision lives in
 * hub/queries.ts's header: OP hubs get their own root instead of /c/ because
 * the vocabulary differs and MTG's 4k /c/ URLs must not move.
 *
 * Cold-start composition (adapter contract types.ts: optcg ships no
 * `hub` capability, so hubs show CARD DATA ONLY): leader art, colors, life,
 * traits, effect text, namesake cross-links, and browse links into /cards —
 * plus the build CTA. Deliberately NO staples/budget/combos/tournament/deck
 * sections: every one of those signals is MTG-only today (popularity and
 * prices are all-NULL for OP, no Spellbook analogue, no tournament corpus),
 * and the cold-start rule (plan §1) bans rendering empty or faked shelves.
 * Real deck shelves return the day real OP decks exist — the counter runs.
 *
 * Caching intent: ISR, revalidate hourly — same reasoning as /c/[slug]:
 * card data changes once nightly, no per-viewer state, rendered on demand.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Button } from "@/components/ui/button";
import { FORMAT_ID, GAME_ID } from "@/db/seed-data";
import { embeddablePrintingImageUrl } from "@/lib/cards/images";
import { getAdapter } from "@/lib/games/registry";
import type { CardData } from "@/lib/games/types";
import type { OptcgAttrs } from "@/lib/games/optcg/adapter";
import { maskToOptcgColorNames, maskToOptcgLetters, OPTCG_COLORS } from "@/lib/games/optcg/colors";
import {
  loadDefaultPrinting,
  loadLeaderBySlug,
  loadLeaderStatus,
  loadOpLeaderSiblings,
} from "@/lib/hub/queries";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/jsonld";

export const revalidate = 3600;

const getLeader = cache((slug: string) => loadLeaderBySlug(GAME_ID.optcg, slug));

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

  const [printing, status, siblings] = await Promise.all([
    loadDefaultPrinting(leader.id),
    loadLeaderStatus(FORMAT_ID.optcgStandard, leader.id),
    loadOpLeaderSiblings(leader.name, leader.id),
  ]);

  const adapter = getAdapter("optcg");
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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "One Piece Leaders", path: "/leaders" },
          { name: `${leader.name} (${leader.externalKey})`, path: `/l/${slug}` },
        ])}
      />
      <Link href="/leaders" className="text-muted-foreground text-sm hover:underline">
        ← One Piece Leaders
      </Link>

      <div className="mt-4 flex flex-col gap-8 md:flex-row">
        <div className="shrink-0">
          {imageUrl ? (
            // R2 mirror hotlink, unoptimized by design (CLAUDE.md: Hobby image
            // quota). Full-card image keeps Bandai's own frame text intact.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={leader.name}
              width={488}
              height={680}
              className="w-72 rounded-2xl shadow-lg"
            />
          ) : (
            <div className="bg-muted flex h-96 w-72 items-center justify-center rounded-2xl px-6 text-center text-sm">
              Card image coming soon
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{leader.name}</h1>
            <span className="text-muted-foreground text-lg tabular-nums uppercase">
              {leader.externalKey}
            </span>
          </div>
          <p className="text-muted-foreground mt-1">
            {adapter.display.subtitle(card)}
            {statLine ? ` · ${statLine}` : ""}
          </p>

          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {colorNames.map((name) => {
              const def = OPTCG_COLORS.find((c) => c.name === name);
              return (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5"
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: def?.hex }}
                  />
                  {name}
                </span>
              );
            })}
            {status !== "legal" && (
              <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-red-600 dark:text-red-400">
                {status.replace("_", " ")} in Standard
              </span>
            )}
          </p>

          <div className="mt-4 whitespace-pre-wrap text-[0.95rem] leading-relaxed">
            {adapter.display.bodyText(card)}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button nativeButton={false} render={<Link href="/decks/new?game=optcg" />}>
              Build with this leader
            </Button>
            <Link href={`/cards/${leader.id}`} className="text-sm underline">
              Card details, printings & legality →
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

      <p className="text-muted-foreground mt-12 text-xs">
        ©Eiichiro Oda/Shueisha, Toei Animation · ONE PIECE CARD GAME ©BANDAI. Deckwarden is
        unofficial fan content, not affiliated with or endorsed by Bandai, Shueisha, or Toei
        Animation. No official card-data API exists for the One Piece Card Game —{" "}
        <Link href="/legal#one-piece" className="underline">
          how we source this data
        </Link>
        .
      </p>
    </main>
  );
}
