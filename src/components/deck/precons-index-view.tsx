"use client";

/**
 * The /precons filter island (W8b, WAVE2.md D7): search, exact color
 * identity pills (the /commanders semantics — "Azorius precons", not
 * "precons containing W or U"; C = exactly colorless), a year select and a
 * sort select over the tiles the server already shipped. Every tile is in
 * the server HTML (the page is static ISR); filtering only hides — zero
 * requests, zero searchParams.
 *
 * Filter state is EPHEMERAL by decision (W8b): it never reflects into the
 * URL — no searchParams by D7's contract, and no location.hash either,
 * so the canonical stays clean and hydration can never mismatch a
 * hash-carried filter. Pinned by the "never touches the URL" test.
 *
 * Tiles group by release year (newest group first; Oldest inverts the
 * group order) except under Name sort, where one flat A–Z list reads
 * better than years interleaved.
 */
import { useMemo, useState } from "react";

import { ColorChipButton, chipClass } from "@/components/color-chip";
import { DeckTile, DeckTileGrid } from "@/components/deck/deck-tile";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { normalizeCardName } from "@/lib/cards/normalize";
import type { DeckTileData } from "@/lib/decks/tiles";
import { COLOR_ORDER, lettersToMask, type ColorLetter } from "@/lib/games/colors";

export interface PreconItem {
  publicId: string;
  /** Release year for grouping and the year filter; null sorts last. */
  year: number | null;
  /** ISO release date — the island sorts by it itself, never trusting input order. */
  releaseDate: string | null;
  ciMask: number;
  /** Pre-normalized haystack (name + commanders + set) the search box matches against. */
  search: string;
  tile: DeckTileData;
}

export type PreconSort = "newest" | "oldest" | "name";

export const PRECON_SORT_OPTIONS: { value: PreconSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
];

/** Native select styled like Input — one control, no popup machinery to stall in a hidden pane. */
const SELECT_CLASS =
  "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] pointer-coarse:min-h-11";

export function PreconsIndexView({ items }: { items: PreconItem[] }) {
  const [q, setQ] = useState("");
  const [letters, setLetters] = useState("");
  const [year, setYear] = useState<"all" | number>("all");
  const [sort, setSort] = useState<PreconSort>("newest");

  const years = useMemo(
    () =>
      [...new Set(items.flatMap((i) => (i.year === null ? [] : [i.year])))].sort((a, b) => b - a),
    [items],
  );

  // Exact-identity mask: letters "WU" = exactly Azorius; "C" = exactly
  // colorless (mask 0); "" = no color filter.
  const ciMask = letters === "C" ? 0 : letters ? lettersToMask(letters) : null;

  const filtered = useMemo(() => {
    const norm = normalizeCardName(q);
    return items.filter(
      (item) =>
        (norm === "" || item.search.includes(norm)) &&
        (ciMask === null || item.ciMask === ciMask) &&
        (year === "all" || item.year === year),
    );
  }, [items, q, ciMask, year]);

  const groups = useMemo(() => {
    if (sort === "name") {
      const rows = [...filtered].sort((a, b) => a.tile.name.localeCompare(b.tile.name, "en"));
      return rows.length > 0 ? [{ label: null, rows }] : [];
    }
    // Date sorts order here (never trusting input order): newest first,
    // undated last; Oldest inverts. Grouping then just walks the sorted
    // list, so groups come out in the same direction.
    const dir = sort === "oldest" ? -1 : 1;
    const sorted = [...filtered].sort((a, b) => {
      if (a.releaseDate === b.releaseDate) return a.tile.name.localeCompare(b.tile.name, "en");
      if (a.releaseDate === null) return 1;
      if (b.releaseDate === null) return -1;
      return dir * b.releaseDate.localeCompare(a.releaseDate);
    });
    const byYear = new Map<number | null, PreconItem[]>();
    for (const item of sorted) {
      const list = byYear.get(item.year);
      if (list) list.push(item);
      else byYear.set(item.year, [item]);
    }
    return [...byYear.entries()].map(([y, rows]) => ({
      label: y === null ? "Undated" : String(y),
      rows,
    }));
  }, [filtered, sort]);

  const toggleLetter = (c: ColorLetter) => {
    setLetters((current) =>
      c === "C"
        ? current === "C"
          ? ""
          : "C"
        : current.includes(c)
          ? current.replace(c, "").replace("C", "")
          : current.replace("C", "") + c,
    );
  };

  const clearFilters = () => {
    setQ("");
    setLetters("");
    setYear("all");
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-full sm:w-64" role="search">
          <label htmlFor="precons-q" className="sr-only">
            Search decks or commanders
          </label>
          <Input
            id="precons-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search decks or commanders…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div aria-label="Color identity filter" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setLetters("")}
            className={chipClass(letters === "")}
          >
            All
          </button>
          {COLOR_ORDER.map((c) => (
            <ColorChipButton
              key={c}
              game="mtg"
              color={c}
              pressed={c === "C" ? letters === "C" : letters.includes(c)}
              onClick={() => toggleLetter(c)}
              showLabel={false}
            />
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Year</span>
          <select
            value={year === "all" ? "all" : String(year)}
            onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}
            className={SELECT_CLASS}
          >
            <option value="all">All</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PreconSort)}
            className={SELECT_CLASS}
          >
            {PRECON_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          mark
          className="mt-6"
          title="No precons match"
          action={
            <button type="button" onClick={clearFilters} className="underline">
              Clear filters
            </button>
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.label ?? "flat"} className="mt-6">
            {group.label && (
              <h2 className="font-display text-muted-foreground border-b pb-1 text-sm font-semibold">
                {group.label}
              </h2>
            )}
            <DeckTileGrid className="mt-3 lg:grid-cols-2 xl:grid-cols-3">
              {group.rows.map((item) => (
                <DeckTile key={item.publicId} tile={item.tile} badge="Precon" />
              ))}
            </DeckTileGrid>
          </section>
        ))
      )}
    </div>
  );
}
