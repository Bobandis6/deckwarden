"use client";

/**
 * Client search UI over /api/cards/search. Deliberately minimal for P0.6 —
 * the deck editor (P1.2) gets the full keyboard flow; this proves the API and
 * gives cards a browsable home. Game-scoped since P4.4: /cards passes the
 * game (from ?game=) plus initial filter values (so hub browse links land
 * with filters preset); filter options come from that adapter's searchFields.
 *
 * Per-game wiring the adapter defs force: MTG filters color identity
 * (ci=within:), OP filters printed color (color=within: — OP has no CI
 * concept, punk-map). The color toggles are the shared ColorChip since R5a
 * (C14) — the params and the group labels are unchanged. OP adds sort=name explicitly — the route's default
 * sort is popularity, which is all-NULL for OP and would order arbitrarily;
 * MTG keeps it. The trait typeahead renders only when the page passes
 * `distinctField` (OP traits — 171 values, resolved via /api/cards/options;
 * MTG's keywords field is also distinct-from-db but stays un-surfaced here,
 * a deliberate non-goal of P4.4).
 *
 * R6 (REDESIGN.md §2 "Card search"): the filters stand in labelled groups
 * (`<fieldset>` + `<legend>`: Name · Type · Colors · Traits for One Piece),
 * the selected filters show as a row of chips — each a button that removes
 * that one filter — with a Clear all, and the first response in flight
 * paints a skeleton grid of the same columns and card aspect instead of a
 * bare "Loading…" line (Load more keeps its own loading label). The URL
 * params, the API calls, the `ColorChipButton`s and the `autoFocus` are
 * unchanged — a page whose purpose is search focuses its box (phone
 * browsers do not raise the keyboard for `autofocus` without a gesture).
 */
import { XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CardImage } from "@/components/cards/card-image";
import { ColorChipButton, colorChipDef, colorChipDefs } from "@/components/color-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdapter } from "@/lib/games/registry";

const PAGE_SIZE = 60;
/** Two rows of the widest grid (5 columns) while the first page loads. */
export const SKELETON_CARDS = 10;

const GRID_CLASS = "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
const LEGEND_CLASS = "text-muted-foreground mb-1 text-xs font-medium";
const FIELD_CLASS =
  "border-input bg-background focus-visible:ring-ring/50 h-9 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 pointer-coarse:min-h-11";

interface SearchResult {
  id: string;
  name: string;
  image: string | null;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
}

function typeOptions(game: "mtg" | "optcg"): { value: string; label: string }[] {
  const field = getAdapter(game).searchFields.find((f) => f.key === "type");
  if (field?.kind === "multiselect" && Array.isArray(field.options)) return field.options;
  return [];
}

export interface CardSearchProps {
  game: "mtg" | "optcg";
  initialName?: string;
  initialType?: string;
  /** Colorset value ("within:RU" or bare letters) — hub links preset this. */
  initialColors?: string;
  /** Key of a distinct-from-db multiselect to expose as a typeahead (OP traits). */
  distinctField?: string;
  initialDistinct?: string;
}

/** One selected filter as the chip row shows it: the group's word and the value. */
interface ActiveFilter {
  key: string;
  group: string;
  value: string;
  clear: () => void;
}

export function CardSearch({
  game,
  initialName = "",
  initialType = "",
  initialColors = "",
  distinctField,
  initialDistinct = "",
}: CardSearchProps) {
  const [q, setQ] = useState(initialName);
  const [type, setType] = useState(initialType);
  const [colors, setColors] = useState<string[]>(() => {
    // Accept both "within:RU" (hub links) and bare "RU".
    const letters = initialColors.includes(":") ? initialColors.split(":", 2)[1] : initialColors;
    const known = colorChipDefs(game).map((c) => c.key);
    return [
      ...new Set(
        letters
          .toUpperCase()
          .split("")
          .filter((c) => known.includes(c)),
      ),
    ];
  });
  const [distinct, setDistinct] = useState(initialDistinct);
  const [distinctOptions, setDistinctOptions] = useState<string[]>([]);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const colorParam = game === "mtg" ? "ci" : "color";

  const buildUrl = (offset: number) => {
    const params = new URLSearchParams({ game, limit: String(PAGE_SIZE) });
    if (q.trim()) params.set("name", q.trim());
    if (type) params.set("type", type);
    if (colors.length) params.set(colorParam, `within:${colors.join("")}`);
    if (distinctField && distinct.trim()) params.set(distinctField, distinct.trim());
    // Route default sort is popularity — NULL for every OP row (P4.1 measured
    // 0/2,785), which orders arbitrarily. Name is the honest OP default.
    if (game === "optcg" && !q.trim()) params.set("sort", "name");
    if (offset) params.set("offset", String(offset));
    return `/api/cards/search?${params}`;
  };

  const load = async (offset: number, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(offset), { signal: controller.signal });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const json: SearchResponse = await res.json();
      offsetRef.current = offset;
      setData(json);
      setResults((prev) => (append ? [...prev, ...json.results] : json.results));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  // Debounced re-search whenever any filter changes.
  useEffect(() => {
    const t = setTimeout(() => void load(0, false), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, colors.join(""), distinct]);

  // Distinct options (traits) load once per mount — they change only at ingest.
  useEffect(() => {
    if (!distinctField) return;
    const controller = new AbortController();
    fetch(`/api/cards/options?game=${game}&field=${distinctField}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { options: [] }))
      .then((json: { options?: string[] }) => setDistinctOptions(json.options ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [game, distinctField]);

  const toggleColor = (c: string) =>
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const types = typeOptions(game);
  const active: ActiveFilter[] = [
    ...(q.trim() ? [{ key: "name", group: "Name", value: q.trim(), clear: () => setQ("") }] : []),
    ...(type
      ? [
          {
            key: "type",
            group: "Type",
            value: types.find((o) => o.value === type)?.label ?? type,
            clear: () => setType(""),
          },
        ]
      : []),
    ...colors.map((c) => ({
      key: `color-${c}`,
      group: "Color",
      value: colorChipDef(game, c)?.name ?? c,
      clear: () => toggleColor(c),
    })),
    ...(distinctField && distinct.trim()
      ? [{ key: "trait", group: "Trait", value: distinct.trim(), clear: () => setDistinct("") }]
      : []),
  ];
  const clearAll = () => {
    setQ("");
    setType("");
    setColors([]);
    setDistinct("");
  };

  // The skeleton stands in for the FIRST page only: nothing has ever
  // rendered, so the grid's shape is all there is to show. A later
  // re-search keeps the previous results under the live line's count, and
  // Load more keeps its own "Loading…" label.
  const firstLoad = data === null && !error;

  return (
    <div className="mt-6">
      <div data-slot="filter-groups" className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <fieldset className="min-w-0 flex-1 basis-56">
          <legend className={LEGEND_CLASS}>Name</legend>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search card names…"
            aria-label="Card name"
            autoFocus
            className={`${FIELD_CLASS} w-full max-w-sm`}
          />
        </fieldset>
        <fieldset className="min-w-0">
          <legend className={LEGEND_CLASS}>Type</legend>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Card type"
            className={`${FIELD_CLASS} px-2`}
          >
            <option value="">Any type</option>
            {types.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </fieldset>
        <fieldset className="min-w-0">
          {/* Magic filters color IDENTITY (ci=within:), One Piece the printed color. */}
          <legend className={LEGEND_CLASS}>{game === "mtg" ? "Color identity" : "Colors"}</legend>
          <div className="flex flex-wrap gap-1">
            {/* R5a (C14): the shared ColorChip — Magic pips keep the compact letter look with the
                color's name for screen readers; One Piece shows the names as before. */}
            {colorChipDefs(game).map((def) => (
              <ColorChipButton
                key={def.key}
                game={game}
                color={def.key}
                pressed={colors.includes(def.key)}
                onClick={() => toggleColor(def.key)}
                showLabel={game === "optcg"}
              />
            ))}
          </div>
        </fieldset>
        {distinctField && (
          <fieldset className="min-w-0">
            <legend className={LEGEND_CLASS}>Traits</legend>
            <input
              type="text"
              value={distinct}
              onChange={(e) => setDistinct(e.target.value)}
              placeholder="e.g. Straw Hat Crew"
              aria-label="Trait"
              list="card-search-distinct-options"
              className={`${FIELD_CLASS} w-full max-w-52`}
            />
            <datalist id="card-search-distinct-options">
              {distinctOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </fieldset>
        )}
      </div>

      {active.length > 0 && (
        <div data-slot="active-filters" className="mt-3 flex flex-wrap items-center gap-1.5">
          <ul aria-label="Active filters" className="contents">
            {active.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  aria-label={`Remove filter: ${f.group} ${f.value}`}
                  onClick={f.clear}
                  className="bg-muted hover:bg-muted/70 focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs outline-none focus-visible:ring-2 pointer-coarse:min-h-11 pointer-coarse:px-3"
                >
                  <span className="text-muted-foreground">{f.group}:</span> {f.value}
                  <XIcon aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="xs" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}

      <p className="text-muted-foreground mt-3 text-sm" aria-live="polite">
        {error
          ? `Error: ${error}`
          : data
            ? `${data.total.toLocaleString()} card${data.total === 1 ? "" : "s"}`
            : "Loading…"}
      </p>

      {firstLoad ? (
        <ul aria-hidden data-slot="results-skeleton" className={GRID_CLASS}>
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <li key={i}>
              <Skeleton
                className="w-full rounded-[4.75%/3.5%]"
                style={{ aspectRatio: "488 / 680" }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={GRID_CLASS} aria-busy={loading || undefined}>
          {results.map((card) => (
            <li key={card.id}>
              <Link
                href={`/cards/${card.id}`}
                className="focus-visible:ring-accent-game block rounded-[4.75%/3.5%] outline-none focus-visible:ring-2"
              >
                <CardImage src={card.image} alt={card.name} width={488} height={680} frame />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && results.length < data.total && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void load(offsetRef.current + PAGE_SIZE, true)}
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
