"use client";

/**
 * The /sets filter island (X4b, WAVE3.md D4 as amended by the owner's
 * answers of 2026-09-28): a name-or-code box and "Main sets only" — on by
 * default, the owner's "main sets first, one click for all" — over every
 * released Magic set the server already shipped. Filtering only hides
 * rows: zero requests, zero searchParams, nothing in the URL — the /precons
 * decision (LATER row 89), pinned by the same "never touches the URL" test.
 *
 * Every row is rendered, always. The server HTML carries all ~706 links,
 * `hidden` on the ones the default leaves out, so crawlers and a no-JS
 * reader get the whole list in the markup — and the first paint is already
 * the default view: the server render and the first client render share
 * one state, so nothing collapses on hydration and nothing can mismatch.
 *
 * The box matches the way the /cards Set picker does (`matchSets`: the
 * exact code, the name's start, a word's start, the code's start, the name
 * anywhere — one normalizer), but the page keeps its own order — years
 * newest first, a day's sets by line — so a match decides only what shows,
 * never where.
 *
 * A row: the name, the code, its place in its line (`setPlaceShort` — the
 * picker's and the /cards header's words), the release date and the card
 * count, all one link to /cards?set=<code>. One line from `md`; below it,
 * two — the name and the count, then the code · place · date. The text is
 * deferred and the rows memoized: the box answers each keystroke at once,
 * and the list re-decides `hidden` on its items in a render the next
 * keystroke may interrupt, re-rendering no row.
 *
 * U7b (WAVE5.md D8, "Long lists on phones"): a year jump strip under the
 * filters — plain in-page anchors, one per year with a row to show, not
 * filter state (a hash is a scroll position; the island never reads it) —
 * and, below `md`, the years after the first two with a row to show are
 * collapsed under a "Show {year}" row until asked, CSS alone: the `li`
 * `hidden` flags and the section flags are the filter's as before, so the
 * server HTML, the smoke's hidden-row count and every link are unchanged,
 * and from `md` every year shows. Typing in the box opens everything (the
 * matches are the ask); "Main sets only" keeps the fold either way. The
 * count beside "Show {year}" says how many rows the row hides.
 */
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";

import { chipClass } from "@/components/color-chip";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchSets, setPlaceShort, type ReleasedSet } from "@/lib/sets/lines";
import { eventDateLabel } from "@/lib/tournaments/format";
import { cn } from "@/lib/utils";

export interface SetYear {
  year: string;
  sets: ReleasedSet[];
}

/** Years open below `md` before a "Show {year}" row (U7b): the first two with a row to show. */
export const OPEN_YEARS = 2;

/** A year's anchor id, the strip's target (new with U7b; no existing id moved). */
export function setYearId(year: string): string {
  return `sets-${year}`;
}

/** Release years, newest first; inside a year, the list's own order (a day's sets by line). */
export function groupSetsByYear(sets: readonly ReleasedSet[]): SetYear[] {
  const byYear = new Map<string, ReleasedSet[]>();
  for (const set of sets) {
    const year = set.releasedAt.slice(0, 4);
    const rows = byYear.get(year);
    if (rows) rows.push(set);
    else byYear.set(year, [set]);
  }
  return [...byYear]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, rows]) => ({ year, sets: rows }));
}

/**
 * What the filter shows: the codes of the rows to show, and how many other
 * products the text matched while "Main sets only" held them back (the
 * empty state offers them).
 */
export function filterSets(
  sets: readonly ReleasedSet[],
  query: string,
  mainOnly: boolean,
): { shown: Set<string>; otherMatches: number } {
  const shown = new Set<string>();
  let otherMatches = 0;
  for (const set of matchSets(sets, query)) {
    if (!mainOnly || set.group === "main") shown.add(set.code);
    else otherMatches++;
  }
  return { shown, otherMatches };
}

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The meta line's "·" before the place and the date — phones only, and silent to screen readers. */
const DOT = "before:mr-1.5 before:content-['·'_/_''] md:before:content-none";

const SetRow = memo(function SetRow({ set }: { set: ReleasedSet }) {
  return (
    <Link
      href={`/cards?set=${set.code}`}
      prefetch={false}
      className="hover:bg-muted focus-visible:ring-ring/50 flex flex-wrap items-baseline gap-x-3 rounded-md px-2 py-2 outline-none focus-visible:ring-2 pointer-coarse:py-3"
    >
      <span className="min-w-0 flex-1 font-medium">{set.name}</span>
      <span className="text-muted-foreground order-last flex w-full flex-wrap gap-x-1.5 text-xs md:contents md:text-sm">
        <span className="font-mono text-xs uppercase md:w-14">{set.code}</span>
        <span className={`${DOT} md:w-52`}>{setPlaceShort(set)}</span>
        <span className={`${DOT} md:w-28`}>{eventDateLabel(set.releasedAt)}</span>
      </span>
      <span className="text-sm tabular-nums md:w-24 md:text-right">
        {count(set.cards, "card", "cards")}
      </span>
    </Link>
  );
});

/**
 * The year groups; re-renders only when what shows or what is opened
 * changes (`shown` is memoized upstream, `opened` is replaced, never
 * mutated). `folded` is false while the box has text.
 */
const SetYears = memo(function SetYears({
  years,
  shown,
  folded,
  opened,
  onOpen,
}: {
  years: SetYear[];
  shown: Set<string>;
  folded: boolean;
  opened: ReadonlySet<string>;
  onOpen: (year: string) => void;
}) {
  // The fold counts the years with a row to show, in page order: the first
  // OPEN_YEARS stay open, the rest collapse until asked.
  let position = 0;
  return years.map(({ year, sets }) => {
    const visible = sets.filter((set) => shown.has(set.code)).length;
    const hidden = visible === 0;
    const collapsed = folded && !hidden && position++ >= OPEN_YEARS && !opened.has(year);
    return (
      <section
        key={year}
        id={setYearId(year)}
        hidden={hidden}
        className={cn("mt-6", collapsed && "max-md:mt-3")}
      >
        <div className="flex items-baseline justify-between gap-3 border-b pb-1">
          <h2 className="type-small text-muted-foreground">{year}</h2>
          {collapsed && (
            <span className="flex items-baseline gap-3 md:hidden">
              <span className="text-muted-foreground type-meta">
                {count(visible, "set", "sets")}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpen(year)}>
                Show {year}
              </Button>
            </span>
          )}
        </div>
        <ul className={cn("-mx-2 mt-1", collapsed && "max-md:hidden")}>
          {sets.map((set) => (
            <li key={set.code} hidden={!shown.has(set.code)}>
              <SetRow set={set} />
            </li>
          ))}
        </ul>
      </section>
    );
  });
});

export function SetsIndexView({ sets }: { sets: ReleasedSet[] }) {
  const [q, setQ] = useState("");
  const [mainOnly, setMainOnly] = useState(true);
  /** Years a reader opened with "Show {year}" (U7b); one-way, like the folds. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const onOpen = useCallback((year: string) => {
    setOpened((prev) => new Set(prev).add(year));
  }, []);

  const years = useMemo(() => groupSetsByYear(sets), [sets]);
  // The box shows each keystroke at once; the ~706 rows follow in a render
  // the next keystroke may interrupt.
  const query = useDeferredValue(q);
  const { shown, otherMatches } = useMemo(
    () => filterSets(sets, query, mainOnly),
    [sets, query, mainOnly],
  );
  const folded = query.trim() === "";
  const strip = years.filter(({ sets: rows }) => rows.some((set) => shown.has(set.code)));

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-full sm:w-64" role="search">
          <label htmlFor="sets-q" className="sr-only">
            Filter sets by name or code
          </label>
          <Input
            id="sets-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter sets…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
          <input
            type="checkbox"
            checked={mainOnly}
            onChange={(e) => setMainOnly(e.target.checked)}
            className="accent-primary size-4"
          />
          Main sets only
        </label>
        <p role="status" className="text-muted-foreground text-xs sm:ml-auto">
          {shown.size === sets.length
            ? `Showing all ${count(sets.length, "set", "sets")}`
            : `Showing ${shown.size.toLocaleString("en-US")} of ${count(sets.length, "set", "sets")}`}
        </p>
      </div>

      {/* The year jump strip (U7b): in-page anchors, a rail that scrolls
          sideways below `md` and wraps from it; one chip per year shown. */}
      {strip.length > 1 && (
        <nav
          aria-label="Jump to year"
          className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
        >
          {strip.map(({ year }) => (
            <a key={year} href={`#${setYearId(year)}`} className={chipClass(false, "shrink-0")}>
              {year}
            </a>
          ))}
        </nav>
      )}

      {shown.size === 0 && (
        <EmptyState
          mark
          className="mt-6"
          title={otherMatches > 0 ? "No main sets match" : "No sets match"}
          action={
            otherMatches > 0 ? (
              <button type="button" onClick={() => setMainOnly(false)} className="underline">
                Show {count(otherMatches, "other product", "other products")}
              </button>
            ) : (
              <button type="button" onClick={() => setQ("")} className="underline">
                Clear filter
              </button>
            )
          }
        />
      )}

      <SetYears years={years} shown={shown} folded={folded} opened={opened} onOpen={onOpen} />
    </div>
  );
}
