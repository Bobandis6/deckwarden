"use client";

/**
 * Client search UI over /api/cards/search. Deliberately minimal for P0.6 —
 * the deck editor (P1.2) gets the full keyboard flow; this proves the API and
 * gives cards a browsable home. Filter options come from the adapter's
 * searchFields (pure module, safe client-side) — no game specifics here.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getAdapter } from "@/lib/games/registry";

const GAME = "mtg";
const PAGE_SIZE = 60;
const COLOR_LETTERS = ["W", "U", "B", "R", "G", "C"] as const;

interface SearchResult {
  id: string;
  name: string;
  typeLine: string | null;
  image: string | null;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
}

function typeOptions(): { value: string; label: string }[] {
  const field = getAdapter(GAME).searchFields.find((f) => f.key === "type");
  if (field?.kind === "multiselect" && Array.isArray(field.options)) return field.options;
  return [];
}

export function CardSearch() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const buildUrl = (offset: number) => {
    const params = new URLSearchParams({ game: GAME, limit: String(PAGE_SIZE) });
    if (q.trim()) params.set("name", q.trim());
    if (type) params.set("type", type);
    if (colors.length) params.set("ci", `within:${colors.join("")}`);
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
  }, [q, type, colors.join("")]);

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
          {typeOptions().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flex gap-1" role="group" aria-label="Color identity (within)">
          {COLOR_LETTERS.map((c) => (
            <Button
              key={c}
              variant={colors.includes(c) ? "default" : "outline"}
              size="icon-xs"
              aria-pressed={colors.includes(c)}
              onClick={() => toggleColor(c)}
            >
              {c}
            </Button>
          ))}
        </div>
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
                // Scryfall CDN hotlink; full card image keeps artist/© visible.
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
