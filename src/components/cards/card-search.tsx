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
 *
 * X2 (WAVE3.md D2): the Name box is the predictive island, still controlled
 * by `q` (so the chips, Clear all and the grid read the same text), its
 * input now a `combobox` named "Card name". A row opens the card page — for
 * leaders too; the card page links the hub — and a pick never rewrites `q`,
 * so the grid is not re-run on the way out. The grid itself keeps updating
 * as you type; with a name it asks for `sort=best` (REC-2), the dropdown's
 * order, so the first tile is the first suggestion. Enter does nothing new:
 * there is no form, and the grid is already live.
 *
 * X4a (WAVE3.md D4 + the owner's answers of 2026-09-28): a Set group, only
 * when the game's adapter declares a `"set"` field (Magic; its one
 * declaration is the rollback). Its box is the SetPicker over GET
 * /api/sets — fetched the first time the picker opens, or at mount when
 * the page arrived with `?set=` (the chip and the header need the name);
 * otherwise mount still costs exactly one request. A chosen set:
 * - joins the requests as `set=<code>` (after the other filters, before
 *   `sort`); with no name the grid asks for `sort=number` — collector-number
 *   order — and with a name keeps `sort=best`, the dropdown's order;
 * - shows as a chip ("Set: Eldritch Moon (EMN)", the code alone until the
 *   list has named it) that × clears, like Clear all;
 * - heads the results with its place in its line ("Eldritch Moon — the 71st
 *   expansion set"), then — while no name is typed — "Most played in
 *   Eldritch Moon": the 12 best EDHREC-ranked cards (a second request,
 *   `sort=pop&limit=12`, unranked cards dropped, hidden when the whole list
 *   fits in 12), then the full list;
 * - makes every tile show and link its printing in the set:
 *   `/cards/<id>?printing=<printingId>` (the card page restores it after
 *   hydration).
 * The Name box's dropdown stays unscoped while a set scopes the grid — a
 * suggestion is "go to this card" (LATER row 124). Filters are still read
 * once at load and never written back to the URL.
 */
import { XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PRINTING_PARAM } from "@/app/(site)/cards/[id]/printing-param";
import { CardImage } from "@/components/cards/card-image";
import { SetPicker } from "@/components/cards/set-picker";
import { ColorChipButton, colorChipDef, colorChipDefs } from "@/components/color-chip";
import { NameSuggest } from "@/components/search/name-suggest";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdapter } from "@/lib/games/registry";
import { setFieldKey, setPlace, type ReleasedSet } from "@/lib/sets/lines";
import { eventDateLabel } from "@/lib/tournaments/format";

const PAGE_SIZE = 60;
/** Two rows of the widest grid (5 columns) while the first page loads. */
export const SKELETON_CARDS = 10;
/** "Most played in {set}": the owner's 12 (2026-09-28). */
export const MOST_PLAYED = 12;

const GRID_CLASS = "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
const LEGEND_CLASS = "text-muted-foreground mb-1 text-xs font-medium";
const FIELD_CLASS =
  "border-input bg-background focus-visible:ring-ring/50 h-9 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 pointer-coarse:min-h-11";

interface SearchResult {
  id: string;
  name: string;
  image: string | null;
  /** EDHREC rank for Magic (lower = more played); null when unranked. */
  popularity?: number | null;
  /** X4a: the printing in the chosen set — present only on a set-scoped answer. */
  printingId?: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
}

/** The card page, on the tile's printing when the answer was set-scoped (X4a). */
function tileHref(card: SearchResult): string {
  return card.printingId
    ? `/cards/${card.id}?${PRINTING_PARAM}=${card.printingId}`
    : `/cards/${card.id}`;
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
  /** X4a: a set code (`?set=`), honored only when the game declares a set field. */
  initialSet?: string;
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
  initialSet = "",
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

  // X4a: the set scope — only for a game whose adapter declares the field.
  const setField = setFieldKey(getAdapter(game).searchFields);
  const [setCode, setSetCode] = useState(() => (setField ? initialSet.trim().toLowerCase() : ""));
  /** The list is wanted once the picker opens, or at mount for a preset set. */
  const [wantSets, setWantSets] = useState(() => setField !== null && setCode !== "");
  const [setsAttempt, setSetsAttempt] = useState(0);
  const [sets, setSets] = useState<ReleasedSet[] | null>(null);
  const [setsFailed, setSetsFailed] = useState(false);
  /** "Most played in {set}", with the set and the total it was asked for. */
  const [strip, setStrip] = useState<{ code: string; rows: SearchResult[]; total: number } | null>(
    null,
  );
  const stripAbortRef = useRef<AbortController | null>(null);
  const chosenSet = setCode ? (sets?.find((set) => set.code === setCode) ?? null) : null;
  const scoped = setField !== null && setCode !== "";

  const colorParam = game === "mtg" ? "ci" : "color";

  /** The grid's request — or, with `mostPlayed`, the set's "Most played" strip. */
  const buildUrl = (offset: number, mostPlayed = false) => {
    const params = new URLSearchParams({
      game,
      limit: String(mostPlayed ? MOST_PLAYED : PAGE_SIZE),
    });
    if (q.trim() && !mostPlayed) params.set("name", q.trim());
    if (type) params.set("type", type);
    if (colors.length) params.set(colorParam, `within:${colors.join("")}`);
    if (distinctField && distinct.trim()) params.set(distinctField, distinct.trim());
    if (setField && scoped) params.set(setField, setCode);
    // With a name: the ranked matcher's order (X2, REC-2), both games. Without
    // one the route's default sort is popularity — NULL for every OP row (P4.1
    // measured 0/2,785), which orders arbitrarily. Name is the honest OP
    // default; Magic keeps popularity. X4a: a set with no name lists in
    // collector-number order, and its strip asks for popularity outright.
    if (mostPlayed) params.set("sort", "pop");
    else if (q.trim()) params.set("sort", "best");
    else if (scoped) params.set("sort", "number");
    else if (game === "optcg") params.set("sort", "name");
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

  // X4a: the strip rides the grid's debounce — asked for only with a set and
  // no name. Unranked cards are dropped: "most played" needs a rank to say so.
  const loadStrip = async () => {
    stripAbortRef.current?.abort();
    stripAbortRef.current = null;
    if (!scoped || q.trim()) {
      setStrip(null);
      return;
    }
    const controller = new AbortController();
    stripAbortRef.current = controller;
    try {
      const res = await fetch(buildUrl(0, true), { signal: controller.signal });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const json: SearchResponse = await res.json();
      const rows = json.results.filter((card) => card.popularity != null);
      setStrip({ code: setCode, rows, total: json.total });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setStrip(null);
    }
  };

  // Debounced re-search whenever any filter changes.
  useEffect(() => {
    const t = setTimeout(() => {
      void load(0, false);
      void loadStrip();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, colors.join(""), distinct, setCode]);

  // X4a: the released-set list, once — on the picker's first open, or at
  // mount for a preset `?set=`. A failure retries on the picker's next open.
  useEffect(() => {
    if (!wantSets || sets) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/sets?game=${game}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Sets failed (${res.status})`);
        const json = (await res.json()) as { sets: ReleasedSet[] };
        setSets(json.sets);
        setSetsFailed(false);
      } catch {
        if (!controller.signal.aborted) setSetsFailed(true);
      }
    })();
    return () => controller.abort();
  }, [game, wantSets, sets, setsAttempt]);

  const wantSetList = () => {
    setWantSets(true);
    if (setsFailed) {
      setSetsFailed(false);
      setSetsAttempt((n) => n + 1);
    }
  };

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
    ...(scoped
      ? [
          {
            key: "set",
            group: "Set",
            value: chosenSet
              ? `${chosenSet.name} (${setCode.toUpperCase()})`
              : setCode.toUpperCase(),
            clear: () => setSetCode(""),
          },
        ]
      : []),
  ];
  const clearAll = () => {
    setQ("");
    setType("");
    setColors([]);
    setDistinct("");
    setSetCode("");
  };
  /** The set view: a set chosen and no name typed (the strip and the collector order). */
  const setView = scoped && !q.trim();
  const showStrip =
    setView &&
    strip !== null &&
    strip.code === setCode &&
    strip.rows.length > 0 &&
    strip.total > MOST_PLAYED;
  const otherFilters = type !== "" || colors.length > 0 || (!!distinctField && !!distinct.trim());

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
          <NameSuggest
            game={game}
            scope="cards"
            rowHref={{ prefix: "/cards/", key: "id" }}
            detail={game === "mtg" ? "type" : "number"}
            value={q}
            onValueChange={setQ}
            placeholder="Search card names…"
            aria-label="Card name"
            autoFocus
            inputClassName={`${FIELD_CLASS} w-full max-w-sm`}
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
        {setField && (
          <fieldset className="min-w-0 flex-1 basis-56">
            <legend className={LEGEND_CLASS}>Set</legend>
            <SetPicker
              sets={sets}
              failed={setsFailed}
              chosen={chosenSet}
              onWantSets={wantSetList}
              onPick={(set) => setSetCode(set.code)}
              inputClassName={`${FIELD_CLASS} w-full max-w-sm`}
            />
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

      {scoped && (chosenSet || sets) && (
        <div data-slot="set-header" className="mt-6">
          {chosenSet ? (
            <>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {chosenSet.name}{" "}
                <span className="text-muted-foreground font-normal">— {setPlace(chosenSet)}</span>
              </h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {setCode.toUpperCase()} · Released {eventDateLabel(chosenSet.releasedAt)}
              </p>
            </>
          ) : (
            <p className="text-sm">No released set has the code “{setCode.toUpperCase()}”.</p>
          )}
        </div>
      )}

      {showStrip && strip && (
        <section aria-labelledby="most-played-heading" data-slot="most-played" className="mt-6">
          <h3 id="most-played-heading" className="font-display text-lg font-semibold">
            Most played in {chosenSet?.name ?? setCode.toUpperCase()}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Ranked by EDHREC play data via Scryfall.
          </p>
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {strip.rows.map((card) => (
              <li key={card.id}>
                <Link
                  href={tileHref(card)}
                  className="focus-visible:ring-accent-game block rounded-[4.75%/3.5%] outline-none focus-visible:ring-2"
                >
                  <CardImage src={card.image} alt={card.name} width={488} height={680} frame />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-muted-foreground mt-3 text-sm" aria-live="polite">
        {error
          ? `Error: ${error}`
          : data
            ? setView && data.total > 0
              ? `${otherFilters ? "" : "All "}${data.total.toLocaleString()} card${data.total === 1 ? "" : "s"}, in collector-number order`
              : `${data.total.toLocaleString()} card${data.total === 1 ? "" : "s"}`
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
                href={tileHref(card)}
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
