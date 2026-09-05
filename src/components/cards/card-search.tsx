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
 * concept, punk-map). OP adds sort=name explicitly — the route's default
 * sort is popularity, which is all-NULL for OP and would order arbitrarily;
 * MTG keeps it. The trait typeahead renders only when the page passes
 * `distinctField` (OP traits — 171 values, resolved via /api/cards/options;
 * MTG's keywords field is also distinct-from-db but stays un-surfaced here,
 * a deliberate non-goal of P4.4).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getAdapter } from "@/lib/games/registry";
import { OPTCG_COLORS } from "@/lib/games/optcg/colors";

const PAGE_SIZE = 60;

/** Per-game color toggles: mask letter (colorset grammar) + visible label. */
const COLOR_TOGGLES: Record<string, Array<{ letter: string; label: string }>> = {
  mtg: ["W", "U", "B", "R", "G", "C"].map((c) => ({ letter: c, label: c })),
  optcg: OPTCG_COLORS.map((c) => ({ letter: c.maskLetter, label: c.name })),
};

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
    const known = COLOR_TOGGLES[game].map((c) => c.letter);
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

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search card names…"
          autoFocus
          className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full max-w-sm rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
        >
          <option value="">Any type</option>
          {typeOptions(game).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label={game === "mtg" ? "Color identity (within)" : "Color (within)"}
        >
          {COLOR_TOGGLES[game].map(({ letter, label }) => (
            <Button
              key={letter}
              variant={colors.includes(letter) ? "default" : "outline"}
              size={game === "mtg" ? "icon-xs" : "xs"}
              aria-pressed={colors.includes(letter)}
              onClick={() => toggleColor(letter)}
            >
              {label}
            </Button>
          ))}
        </div>
        {distinctField && (
          <>
            <input
              type="text"
              value={distinct}
              onChange={(e) => setDistinct(e.target.value)}
              placeholder="Trait — e.g. Straw Hat Crew"
              list="card-search-distinct-options"
              className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full max-w-52 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
            />
            <datalist id="card-search-distinct-options">
              {distinctOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </>
        )}
      </div>

      <p className="text-muted-foreground mt-3 text-sm" aria-live="polite">
        {error
          ? `Error: ${error}`
          : data
            ? `${data.total.toLocaleString()} card${data.total === 1 ? "" : "s"}`
            : "Loading…"}
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {results.map((card) => (
          <li key={card.id}>
            <Link href={`/cards/${card.id}`} className="block">
              {card.image ? (
                // CDN hotlink (Scryfall for MTG, the R2 mirror for OP); full
                // card image keeps the frame's own credit text visible.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.image}
                  alt={card.name}
                  loading="lazy"
                  width={488}
                  height={680}
                  className="rounded-[4.75%/3.5%] transition-transform hover:scale-[1.03]"
                />
              ) : (
                <span className="bg-muted flex aspect-[488/680] items-center justify-center rounded-xl p-2 text-center text-sm">
                  {card.name}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

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
