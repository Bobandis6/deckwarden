"use client";

/**
 * The leader index body (R5a, REDESIGN.md §2 "Commander and leader
 * indexes"): the compact list or the image grid, behind a List / Grid toggle
 * persisted under `deckwarden:index-view` (lib/hub/index-view.ts) — one
 * value for both indexes. The store's server snapshot is "list", so the
 * server HTML always carries the list (hubs-smoke greps it; it is what gets
 * indexed) and a Grid reader sees the grid after hydration — the same
 * flash-to-preference the deck view has had since P1.3.
 *
 * Both views render the same rows and the same hrefs, ending right after the
 * slug (the smokes' negative checks depend on that). Two flavors:
 *   - `mtg` (/commanders): rows link `/c/<slug>` with the rank, the name and
 *     the identity pips; the grid puts the rank top-left, the corner that
 *     never covers the artist / © line (C13's rule).
 *   - `optcg` (/leaders, P4.9): rows link `/l/<slug>` with the name, the
 *     printed card number (17 Luffys), the life and the color chips — the
 *     list is /leaders' markup from before P4.9 — and the grid puts the card
 *     number top-left, like the home shelf's One Piece cards. There is no
 *     rank: A to Z is not a ranking.
 * The grid is the `small` rendition with the G2 frame, lazy; a leader
 * without one shows its name in the box. ?colors= / ?page= / ?q= are the
 * page's; the toggle never touches the URL. `summary` is a polite live
 * line left of the toggle (/leaders' count). It is text, not an element:
 * a server-made element placed beside the toggle trips React's key check
 * across the RSC boundary (seen in dev, P4.9).
 */
import Link from "next/link";

import { CardImage } from "@/components/cards/card-image";
import { ColorChipList } from "@/components/color-chip";
import { Segmented } from "@/components/deck/segmented";
import { TILE_IMAGE } from "@/lib/decks/tiles";
import { ciPipsHtml } from "@/lib/games/colors";
import { saveIndexView, useIndexView, type IndexView } from "@/lib/hub/index-view";
import { cn } from "@/lib/utils";

export type IndexGame = "mtg" | "optcg";

export interface IndexLeader {
  id: string;
  name: string;
  slug: string;
  /** Magic: 1-based across pages, (page − 1) × page size + position. One Piece: null. */
  rank: number | null;
  /** The color mask (Magic: ci_mask; One Piece: colors_mask). */
  ciMask: number;
  /** The `small` rendition of the default printing; null = the name in a box. */
  image: string | null;
  /** One Piece: the printed card number. */
  externalKey?: string;
  /** One Piece: the leader's life. */
  life?: number | null;
}

export const INDEX_VIEW_OPTIONS: { value: IndexView; label: string }[] = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
];

const HUB_PREFIX: Record<IndexGame, string> = { mtg: "/c/", optcg: "/l/" };

const BADGE_CLASS = "bg-background/85 absolute top-1 left-1 rounded px-1 text-[10px]";

function ListRow({ game, leader }: { game: IndexGame; leader: IndexLeader }) {
  if (game === "optcg") {
    return (
      <>
        <span className="min-w-0">
          <span className="text-sm font-medium">{leader.name}</span>
          <span className="text-muted-foreground ml-2 text-xs tabular-nums uppercase">
            {leader.externalKey}
          </span>
          {leader.life != null && (
            <span className="text-muted-foreground ml-2 text-xs">{leader.life} Life</span>
          )}
        </span>
        <ColorChipList game="optcg" mask={leader.ciMask} className="text-xs" />
      </>
    );
  }
  return (
    <>
      <span className="min-w-0">
        <span className="text-muted-foreground mr-2 text-xs tabular-nums">{leader.rank}</span>
        <span className="text-sm font-medium">{leader.name}</span>
      </span>
      <span className="shrink-0" dangerouslySetInnerHTML={{ __html: ciPipsHtml(leader.ciMask) }} />
    </>
  );
}

function GridCaption({ game, leader }: { game: IndexGame; leader: IndexLeader }) {
  if (game === "optcg") {
    return (
      <>
        <span className={cn(BADGE_CLASS, "font-mono uppercase")}>{leader.externalKey}</span>
        <span className="mt-1.5 block truncate text-xs font-medium">{leader.name}</span>
        <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
          <ColorChipList game="optcg" mask={leader.ciMask} className="text-[9px]" />
          {leader.life != null && <span>{leader.life} Life</span>}
        </span>
      </>
    );
  }
  return (
    <>
      <span className={cn(BADGE_CLASS, "tabular-nums")}>{leader.rank}</span>
      <span className="mt-1.5 block truncate text-xs font-medium">{leader.name}</span>
      <span
        className="block text-xs"
        dangerouslySetInnerHTML={{ __html: ciPipsHtml(leader.ciMask) }}
      />
    </>
  );
}

export function LeaderIndexView({
  leaders,
  game = "mtg",
  summary,
}: {
  leaders: IndexLeader[];
  game?: IndexGame;
  summary?: string;
}) {
  const view = useIndexView();
  const hub = HUB_PREFIX[game];
  return (
    <div className="mt-6">
      <div className={cn("flex items-center gap-3", summary ? "justify-between" : "justify-end")}>
        {summary && (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {summary}
          </p>
        )}
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
                href={`${hub}${leader.slug}`}
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
                <GridCaption game={game} leader={leader} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border">
          {leaders.map((leader) => (
            <li key={leader.id}>
              <Link
                href={`${hub}${leader.slug}`}
                className="flex items-center justify-between gap-3 px-3 py-2 hover:underline"
              >
                <ListRow game={game} leader={leader} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
