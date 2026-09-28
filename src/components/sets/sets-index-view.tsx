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
 */
import Link from "next/link";
import { memo, useDeferredValue, useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { matchSets, setPlaceShort, type ReleasedSet } from "@/lib/sets/lines";
import { eventDateLabel } from "@/lib/tournaments/format";

export interface SetYear {
  year: string;
  sets: ReleasedSet[];
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

/** The year groups; re-renders only when what shows changes (`shown` is memoized upstream). */
const SetYears = memo(function SetYears({
  years,
  shown,
}: {
  years: SetYear[];
  shown: Set<string>;
}) {
  return years.map(({ year, sets }) => (
    <section key={year} hidden={!sets.some((set) => shown.has(set.code))} className="mt-6">
      <h2 className="font-display text-muted-foreground border-b pb-1 text-sm font-semibold">
        {year}
      </h2>
      <ul className="-mx-2 mt-1">
        {sets.map((set) => (
          <li key={set.code} hidden={!shown.has(set.code)}>
            <SetRow set={set} />
          </li>
        ))}
      </ul>
    </section>
  ));
});

export function SetsIndexView({ sets }: { sets: ReleasedSet[] }) {
  const [q, setQ] = useState("");
  const [mainOnly, setMainOnly] = useState(true);

  const years = useMemo(() => groupSetsByYear(sets), [sets]);
  // The box shows each keystroke at once; the ~706 rows follow in a render
  // the next keystroke may interrupt.
  const query = useDeferredValue(q);
  const { shown, otherMatches } = useMemo(
    () => filterSets(sets, query, mainOnly),
    [sets, query, mainOnly],
  );

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

      <SetYears years={years} shown={shown} />
    </div>
  );
}
