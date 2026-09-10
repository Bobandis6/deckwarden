"use client";

/**
 * The /commanders index body (R5a, REDESIGN.md §2 "Commander and leader
 * indexes"): the compact list — today's markup, unchanged — or the image
 * grid, behind a List / Grid toggle persisted under `deckwarden:index-view`
 * (lib/hub/index-view.ts). The store's server snapshot is "list", so the
 * server HTML always carries the list (hubs-smoke greps it; it is what gets
 * indexed) and a Grid reader sees the grid after hydration — the same
 * flash-to-preference the deck view has had since P1.3.
 *
 * Both views render the same rows and the same hrefs (`/c/<slug>`, ending
 * right after the slug — the smokes' negative checks depend on that), the
 * rank numbers, the names and the identity pips; the grid adds the `small`
 * rendition with the G2 frame and puts the rank top-left, the corner that
 * never covers the artist / © line (C13's rule). ?colors= and ?page= are
 * the page's; the toggle never touches the URL. /leaders renders no toggle
 * until LATER row 51 (142 r2.dev images on one page is the throttling the
 * row names).
 */
import Link from "next/link";

import { CardImage } from "@/components/cards/card-image";
import { Segmented } from "@/components/deck/segmented";
import { TILE_IMAGE } from "@/lib/decks/tiles";
import { ciPipsHtml } from "@/lib/games/colors";
import { saveIndexView, useIndexView, type IndexView } from "@/lib/hub/index-view";

export interface IndexLeader {
  id: string;
  name: string;
  slug: string;
  /** 1-based across pages: (page − 1) × page size + position. */
  rank: number;
  ciMask: number;
  /** The `small` rendition of the default printing; null = the name in a box. */
  image: string | null;
}

export const INDEX_VIEW_OPTIONS: { value: IndexView; label: string }[] = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
];

export function LeaderIndexView({ leaders }: { leaders: IndexLeader[] }) {
  const view = useIndexView();
  return (
    <div className="mt-6">
      <div className="flex justify-end">
        <Segmented
          label="View"
          ariaLabel="Index view"
          options={INDEX_VIEW_OPTIONS}
          value={view}
          onChange={saveIndexView}
        />
      </div>
      {view === "grid" ? (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
          {leaders.map((leader) => (
            <li key={leader.id} className="relative">
              <Link
                href={`/c/${leader.slug}`}
                className="focus-visible:ring-accent-game block rounded-[4.75%/3.5%] outline-none focus-visible:ring-2"
              >
                <CardImage
                  src={leader.image}
                  alt=""
                  width={TILE_IMAGE.width}
                  height={TILE_IMAGE.height}
                  frame
                  className="h-auto w-full"
                  fallback={leader.name}
                />
                <span className="bg-background/85 absolute top-1 left-1 rounded px-1 text-[10px] tabular-nums">
                  {leader.rank}
                </span>
                <span className="mt-1.5 block truncate text-xs font-medium">{leader.name}</span>
                <span
                  className="block text-xs"
                  dangerouslySetInnerHTML={{ __html: ciPipsHtml(leader.ciMask) }}
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border">
          {leaders.map((leader) => (
            <li key={leader.id}>
              <Link
                href={`/c/${leader.slug}`}
                className="flex items-center justify-between gap-3 px-3 py-2 hover:underline"
              >
                <span className="min-w-0">
                  <span className="text-muted-foreground mr-2 text-xs tabular-nums">
                    {leader.rank}
                  </span>
                  <span className="text-sm font-medium">{leader.name}</span>
                </span>
                <span
                  className="shrink-0"
                  dangerouslySetInnerHTML={{ __html: ciPipsHtml(leader.ciMask) }}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
