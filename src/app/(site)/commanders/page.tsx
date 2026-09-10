/**
 * /commanders — the leader index (P2.4): browse commanders by color and
 * popularity. Rows come straight from card data (edhrec_rank order), so the
 * page is honest with zero users. R5a: the color filter is the shared
 * ColorChip (C14), the rows render through LeaderIndexView — the compact
 * list in the server HTML, an image grid behind the List / Grid toggle
 * persisted under `deckwarden:index-view` — and `data-game="mtg"` gives the
 * chips and frames the Magic accent.
 *
 * Caching intent: force-dynamic — ?colors= / ?page= drive the query, and
 * one partial-indexed read (ci_leaders, now with the default printing
 * joined) per request is cheap; if this page ever shows up in Neon compute,
 * the upgrade path is ISR per filter combination, not a rethink.
 *
 * Color filter semantics: exact color identity ("Azorius commanders", not
 * "commanders that include W or U") — the way players name the space.
 */
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { chipClass, ColorChipLink } from "@/components/color-chip";
import { GameSwitch } from "@/components/game-switch";
import { LeaderIndexView, type IndexLeader } from "@/components/hub/leader-index-view";
import { leaderTileImage } from "@/lib/decks/tiles";
import { COLOR_ORDER, lettersToMask, maskToLetters } from "@/lib/games/colors";
import { LEADERS_PAGE_SIZE, loadLeaderIndex } from "@/lib/hub/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commanders",
  description: "Browse Commander leaders by color identity and popularity.",
  // Filter/page variants (?colors=, ?page=) canonicalize to the bare index —
  // hubs are the real landing pages; faceted lists shouldn't split them (P2.6).
  alternates: { canonical: "/commanders" },
};

function filterHref(letters: string, page = 1): string {
  const params = new URLSearchParams();
  if (letters) params.set("colors", letters.toLowerCase());
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/commanders?${qs}` : "/commanders";
}

export default async function CommandersPage({ searchParams }: PageProps<"/commanders">) {
  const sp = await searchParams;
  const rawColors = typeof sp.colors === "string" ? sp.colors : "";
  const rawPage = typeof sp.page === "string" ? Number(sp.page) : 1;
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 100 ? rawPage : 1;

  // "c" alone = exactly colorless (mask 0); letters = exactly that identity.
  const wantsColorless = /c/i.test(rawColors);
  const colorMask = lettersToMask(rawColors.replace(/c/gi, ""));
  const ciMask = wantsColorless && colorMask === 0 ? 0 : colorMask > 0 ? colorMask : null;
  const activeLetters = ciMask === null ? "" : ciMask === 0 ? "C" : maskToLetters(ciMask).join("");

  const leaders = await loadLeaderIndex({ ciMask, page });
  const hasNext = leaders.length === LEADERS_PAGE_SIZE;
  const rows: IndexLeader[] = leaders.flatMap((leader, i) =>
    leader.slug === null
      ? []
      : [
          {
            id: leader.id,
            name: leader.name,
            slug: leader.slug,
            rank: (page - 1) * LEADERS_PAGE_SIZE + i + 1,
            ciMask: leader.ciMask,
            image: leaderTileImage(
              leader.printingId
                ? { id: leader.printingId, imageOverride: leader.imageOverride }
                : null,
            ),
          },
        ],
  );

  return (
    <main className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game="mtg">
      <h1 className="text-3xl font-semibold tracking-tight">Commanders</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Ranked by how much each commander is actually played (EDHREC data via Scryfall).
      </p>

      {/* Contextual game switch (R1b, REDESIGN.md §2): the One Piece index is one pill away. */}
      <GameSwitch active="mtg" className="mt-4" />

      <nav aria-label="Color identity filter" className="mt-3 flex flex-wrap gap-1.5">
        <Link
          href={filterHref("")}
          aria-current={ciMask === null ? "page" : undefined}
          className={chipClass(ciMask === null)}
        >
          All
        </Link>
        {COLOR_ORDER.map((c) => {
          // Toggle the letter within the current exact-identity selection.
          const next =
            c === "C"
              ? activeLetters === "C"
                ? ""
                : "C"
              : activeLetters.includes(c)
                ? activeLetters.replace(c, "").replace("C", "")
                : activeLetters.replace("C", "") + c;
          const active = c === "C" ? activeLetters === "C" : activeLetters.includes(c);
          return (
            <ColorChipLink key={c} game="mtg" color={c} href={filterHref(next)} active={active} />
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          No commanders match that exact color identity{page > 1 ? " on this page" : ""}.{" "}
          <Link href={filterHref(activeLetters)} className="underline">
            Back to page 1
          </Link>
        </p>
      ) : (
        <LeaderIndexView leaders={rows} />
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link href={filterHref(activeLetters, page - 1)} className="underline">
            <ArrowLeftIcon aria-hidden className="mr-1 inline size-4 align-[-0.2em]" />
            Previous
          </Link>
        ) : (
          <span />
        )}
        {hasNext && (
          <Link href={filterHref(activeLetters, page + 1)} className="underline">
            Next
            <ArrowRightIcon aria-hidden className="ml-1 inline size-4 align-[-0.2em]" />
          </Link>
        )}
      </div>

      <p className="text-muted-foreground mt-12 text-xs">
        Card data and images courtesy of{" "}
        <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
          Scryfall
        </a>
        . Deckwarden is unofficial Fan Content and is not endorsed by Wizards of the Coast.
      </p>
    </main>
  );
}
