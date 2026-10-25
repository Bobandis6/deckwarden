"use client";

/**
 * The Tokens section (DECK-TOKENS, TOKEN-FILL): a deck's tokens, emblems and
 * game pieces — the format's `holds: "tokens"` zone, outside the 100
 * (src/lib/decks/playable.ts) — as one collapsible group after the card
 * list, on the editor and on the share page. The heading is the disclosure:
 * Base UI's Collapsible trigger (a button with aria-expanded and
 * aria-controls) inside an h3 like the type groups' h3s, the zone's label
 * beside its count. The rows follow the pane's View, text or grid: a text
 * row carries the token's caption (`display.tokenCaption`: "1/1 white,
 * flying") because token names don't tell tokens apart; a grid tile is the
 * printed token itself, whose P/T box and frame already do, so no badge
 * covers its name bar.
 *
 * Two kinds of row (TOKEN-FILL). The player's own tokens are rows of the
 * zone — a quantity, steppers, remove — added through "Add a token", a
 * search over the token catalog alone (GET /api/cards/search?tokens=1), into
 * the zone through the pane's one add path (`onAdd`). Under them, "From your
 * cards": the tokens the deck's cards make (`fill`, use-token-fill.ts —
 * Scryfall's links, derived, never stored), each row naming its makers, with
 * no count (add the token to set one) and, in the editor, a Hide that
 * persists on the deck; the hidden ones the cards still link show as chips
 * that undo it. A stored row of the same key supersedes the derived one. The
 * heading counts both. The share page passes neither add nor Hide, and
 * renders the section only when there is a token to show.
 */
import { ChevronDownIcon, EyeOffIcon, PlusIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { CardNamePreview } from "@/components/deck/card-name-preview";
import { DeckGridView } from "@/components/deck/deck-grid-view";
import { DeckTextView, GROUP_HEADER_CLASS, REVEAL_CLASS } from "@/components/deck/deck-text-view";
import type { TokenFillRow, TokenFillState } from "@/components/deck/use-token-fill";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  toEditorCard,
  type CardWire,
  type EditorCard,
  type EditorEntry,
} from "@/lib/decks/editor-state";
import type { DeckGroup, ViewItem } from "@/lib/decks/view-model";
import type { DeckViewMode } from "@/lib/decks/view-prefs";
import type { GameAdapter, ZoneDef } from "@/lib/games/types";
import { cn } from "@/lib/utils";

/** The token search's typed minimum and its page (a pick, not a browse). */
const SEARCH_MIN_CHARS = 2;
const SEARCH_LIMIT = 12;

/** "From your cards" (TOKEN-FILL): the hook's result plus, in the editor, the two persisting edits. */
export interface TokenFillProps {
  /** Derived tokens the list shows — known without a request. */
  count: number;
  /** The shown rows, hydrated. */
  items: TokenFillRow[];
  /** The hidden tokens the cards still link, hydrated — the chips. */
  hidden: TokenFillRow[];
  state: TokenFillState;
  retry?: () => void;
  /** Editor: hide a derived token by its key; show hidden ones again. Absent = read-only. */
  onHide?: (key: string) => void;
  onShow?: (keys: string[]) => void;
}

interface TokensSectionProps {
  adapter: GameAdapter;
  zone: ZoneDef;
  items: ViewItem<EditorEntry, EditorCard>[];
  view: DeckViewMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreview: (card: EditorCard) => void;
  owned?: ReadonlySet<string>;
  /** Editor: steppers and remove on the text rows. Absent = read-only (share page). */
  onSetQty?: (zoneId: string, cardId: string, qty: number) => void;
  onRemove?: (zoneId: string, cardId: string) => void;
  /** Editor: adds into the zone (one card, or several); an error line, or nothing. */
  onAdd?: (cards: EditorCard[]) => string | undefined;
  /** "From your cards" (TOKEN-FILL); absent = nothing derived (a format without links). */
  fill?: TokenFillProps;
  /** Share page: hover and focus previews on the names. */
  preview?: boolean;
  className?: string;
}

export function TokensSection({
  adapter,
  zone,
  items,
  view,
  open,
  onOpenChange,
  onPreview,
  owned,
  onSetQty,
  onRemove,
  onAdd,
  fill,
  preview = false,
  className,
}: TokensSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const caption = adapter.display.tokenCaption;
  const qty = items.reduce((n, i) => n + i.entry.qty, 0);
  // One group, no heading of its own (the disclosure is the heading): name order, captions apart.
  const group: DeckGroup<EditorEntry, EditorCard> = {
    key: `zone:${zone.id}`,
    label: zone.label,
    qty,
    items: [...items].sort(
      (a, b) =>
        a.card.name.localeCompare(b.card.name) ||
        (caption?.(a.card) ?? "").localeCompare(caption?.(b.card) ?? ""),
    ),
  };
  const add = (cards: EditorCard[]) => setError(onAdd?.(cards) ?? null);
  const derived = fill?.count ?? 0;
  const hiddenCount = fill?.hidden.length ?? 0;
  const empty = items.length === 0 && derived === 0 && hiddenCount === 0;

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      render={<section data-slot="tokens-section" className={className} />}
    >
      <h3 className={GROUP_HEADER_CLASS}>
        <CollapsibleTrigger className="group/trigger flex items-center gap-2 rounded text-left hover:underline pointer-coarse:min-h-11">
          <span className="type-eyebrow text-muted-foreground">{zone.label}</span>
          <span
            data-slot="group-count"
            className="text-foreground text-sm font-semibold tabular-nums"
          >
            {qty + derived}
          </span>
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground size-3.5 motion-safe:transition-transform motion-safe:duration-[120ms] group-data-panel-open/trigger:rotate-180"
          />
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className="space-y-3">
        {onAdd && <TokenSearch adapter={adapter} onAdd={(card) => add([card])} />}
        {error && (
          <p aria-live="polite" className="text-destructive text-xs">
            {error}
          </p>
        )}
        {empty ? (
          <p className="text-muted-foreground text-sm">
            No tokens yet. The ones your cards make show up here; they don&apos;t count toward the
            deck&apos;s size.
          </p>
        ) : (
          <>
            {items.length > 0 &&
              (view === "grid" ? (
                <DeckGridView
                  groups={[group]}
                  severity={NO_SEVERITY}
                  onPreview={onPreview}
                  owned={owned}
                  adapter={adapter}
                  headings={false}
                />
              ) : (
                <DeckTextView
                  adapter={adapter}
                  groups={[group]}
                  severity={NO_SEVERITY}
                  onSetQty={onSetQty}
                  onRemove={onRemove}
                  onPreview={onPreview}
                  owned={owned}
                  preview={preview}
                  caption={caption}
                  headings={false}
                />
              ))}
            {fill && (derived > 0 || hiddenCount > 0) && (
              <FromYourCards
                adapter={adapter}
                zone={zone}
                fill={fill}
                view={view}
                onPreview={onPreview}
                owned={owned}
                preview={preview}
              />
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Tokens are never validated (they sit outside the playable list): no rows carry a severity. */
const NO_SEVERITY: ReadonlyMap<string, "error" | "warning"> = new Map();

/**
 * The derived tokens (TOKEN-FILL): an eyebrow, then the rows in the pane's
 * view — text rows with their makers and Hide, or the tiles with no count
 * badge — and the hidden chips. The loading and failed states stand where
 * the rows will.
 */
function FromYourCards({
  adapter,
  zone,
  fill,
  view,
  onPreview,
  owned,
  preview,
}: {
  adapter: GameAdapter;
  zone: ZoneDef;
  fill: TokenFillProps;
  view: DeckViewMode;
  onPreview: (card: EditorCard) => void;
  owned?: ReadonlySet<string>;
  preview: boolean;
}) {
  const headingId = useId();
  const { items, hidden, state, count, retry, onHide, onShow } = fill;
  const caption = adapter.display.tokenCaption;
  const tiles: DeckGroup<EditorEntry, EditorCard> = {
    key: `zone:${zone.id}:fill`,
    label: "From your cards",
    qty: items.length,
    items: items.map(({ card }) => ({
      entry: { cardId: card.id, zone: zone.id, qty: 1, tags: [] },
      card,
    })),
  };
  return (
    <div data-slot="token-fill" aria-labelledby={headingId} role="group" className="space-y-1">
      <p id={headingId} className="type-label-xs text-muted-foreground">
        From your cards
      </p>
      {count > 0 &&
        (state === "failed" ? (
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load your cards&apos; tokens.{" "}
            {retry && (
              <button
                type="button"
                onClick={retry}
                className="cursor-pointer underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
              >
                Retry
              </button>
            )}
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {state === "loading" ? "Finding the tokens your cards make…" : null}
          </p>
        ) : view === "grid" ? (
          <DeckGridView
            groups={[tiles]}
            severity={NO_SEVERITY}
            onPreview={onPreview}
            owned={owned}
            adapter={adapter}
            headings={false}
            counts={false}
          />
        ) : (
          <ul>
            {items.map(({ card, from }) => (
              <FillRow
                key={card.id}
                adapter={adapter}
                card={card}
                from={from}
                onPreview={onPreview}
                owned={owned}
                preview={preview}
                onHide={onHide}
              />
            ))}
          </ul>
        ))}
      {hidden.length > 0 && onShow && (
        <p
          data-slot="token-hidden"
          className="text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs"
        >
          <span>Hidden:</span>
          {hidden.map(({ card }) => {
            const words = caption?.(card);
            return (
              <Button
                key={card.id}
                variant="ghost"
                size="xs"
                aria-label={`Show ${card.name}${words ? ` (${words})` : ""}`}
                onClick={() => onShow([card.externalKey])}
              >
                {card.name}
                {words && <span className="text-muted-foreground font-normal">{words}</span>}
              </Button>
            );
          })}
          {hidden.length > 1 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onShow(hidden.map((h) => h.card.externalKey))}
            >
              Show all
            </Button>
          )}
        </p>
      )}
    </div>
  );
}

/** A derived token's text row: the text view's row shape, the count column empty, its makers, Hide. */
function FillRow({
  adapter,
  card,
  from,
  onPreview,
  owned,
  preview,
  onHide,
}: {
  adapter: GameAdapter;
  card: EditorCard;
  from: string[];
  onPreview: (card: EditorCard) => void;
  owned?: ReadonlySet<string>;
  preview: boolean;
  onHide?: (key: string) => void;
}) {
  const words = adapter.display.tokenCaption?.(card);
  const nameButton = (
    <button
      type="button"
      onClick={() => onPreview(card)}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded px-1 text-left hover:underline",
        onHide && "pointer-coarse:self-stretch",
      )}
    >
      <span className={words ? "shrink-0" : "truncate"}>{card.name}</span>
      {owned?.has(card.id) && (
        <span
          role="img"
          aria-label="In your collection"
          title="In your collection"
          className="shrink-0 text-xs text-emerald-700 dark:text-emerald-400"
        >
          ✓
        </span>
      )}
      {words && (
        <span data-slot="caption" className="text-muted-foreground min-w-0 truncate text-xs">
          {words}
        </span>
      )}
    </button>
  );
  return (
    <li
      className={cn(
        "group/row hover:bg-muted/60 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm",
        onHide && "pointer-coarse:min-h-11",
      )}
    >
      {/* The count column, empty: a derived token carries no quantity (add it to set one). */}
      <span aria-hidden className="w-6 shrink-0" />
      {preview ? (
        <CardNamePreview name={card.name} image={card.image}>
          {nameButton}
        </CardNamePreview>
      ) : (
        nameButton
      )}
      <span
        data-slot="from"
        className="text-muted-foreground min-w-0 flex-1 truncate text-right text-xs"
      >
        from {from.join(", ")}
      </span>
      {onHide && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Hide ${card.name}${words ? ` (${words})` : ""}`}
          title="Hide"
          className={REVEAL_CLASS}
          onClick={() => onHide(card.externalKey)}
        >
          <EyeOffIcon />
        </Button>
      )}
    </li>
  );
}

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; results: EditorCard[]; total: number; more: "idle" | "loading" | "failed" }
  | { kind: "failed" };

/** One page of the token search: the adapter reads the words (tokenQuery), the core asks. */
function tokenSearchPath(adapter: GameAdapter, q: string, offset: number): string {
  const params = new URLSearchParams({
    ...(adapter.tokenQuery?.(q) ?? { name: q }),
    game: adapter.id,
    tokens: "1",
    sort: "best",
    limit: String(SEARCH_LIMIT),
    ...(offset > 0 ? { offset: String(offset) } : {}),
  });
  return `/api/cards/search?${params}`;
}

async function fetchTokenPage(
  adapter: GameAdapter,
  q: string,
  offset: number,
  signal?: AbortSignal,
): Promise<{ results: EditorCard[]; total: number }> {
  const res = await fetch(tokenSearchPath(adapter, q, offset), { signal });
  if (!res.ok) throw new Error(String(res.status));
  const json: { results: CardWire[]; total: number } = await res.json();
  return { results: json.results.map(toEditorCard), total: json.total };
}

function TokenSearch({
  adapter,
  onAdd,
}: {
  adapter: GameAdapter;
  onAdd: (card: EditorCard) => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const q = query.trim();
  const words = adapter.display.tokenSearch;

  useEffect(() => {
    if (q.length < SEARCH_MIN_CHARS) return;
    const controller = new AbortController();
    // State writes only in the timer's callback (the set-state-in-effect rule).
    const timer = setTimeout(async () => {
      setSearch({ kind: "loading" });
      try {
        const page = await fetchTokenPage(adapter, q, 0, controller.signal);
        setSearch({ kind: "done", ...page, more: "idle" });
      } catch {
        if (!controller.signal.aborted) setSearch({ kind: "failed" });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, adapter]);

  // "Show more": the next page, appended — the order breaks every tie, so pages
  // never overlap. A page that lands after the words changed is dropped: the
  // list it would extend is no longer the one on screen.
  const showMore = async () => {
    if (search.kind !== "done") return;
    const base = search.results;
    setSearch({ ...search, more: "loading" });
    try {
      const page = await fetchTokenPage(adapter, q, base.length);
      setSearch((now) =>
        now.kind === "done" && now.results === base
          ? { ...now, results: [...base, ...page.results], more: "idle" }
          : now,
      );
    } catch {
      setSearch((now) =>
        now.kind === "done" && now.results === base ? { ...now, more: "failed" } : now,
      );
    }
  };

  const shown = q.length >= SEARCH_MIN_CHARS ? search : { kind: "idle" as const };
  const left = shown.kind === "done" ? shown.total - shown.results.length : 0;
  return (
    <div data-slot="token-search">
      <Field className="max-w-sm">
        <FieldLabel>Add a token</FieldLabel>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={words?.placeholder}
          autoComplete="off"
        />
      </Field>
      <div aria-live="polite" className="text-muted-foreground mt-1 text-xs empty:hidden">
        {shown.kind === "loading"
          ? "Searching tokens…"
          : shown.kind === "failed"
            ? "The token search failed. Try again."
            : shown.kind === "done" && shown.results.length === 0
              ? `No tokens match “${q}”.`
              : shown.kind === "done" && left > 0
                ? `Showing ${shown.results.length} of ${shown.total}.${words ? ` ${words.narrowHint}` : ""}`
                : null}
      </div>
      {shown.kind === "done" && shown.results.length > 0 && (
        <ul className="mt-1" aria-label="Tokens found">
          {shown.results.map((card) => {
            const caption = adapter.display.tokenCaption?.(card);
            return (
              <li key={card.id}>
                <CardNamePreview name={card.name} image={card.image}>
                  <button
                    type="button"
                    onClick={() => onAdd(card)}
                    aria-label={`Add ${card.name}${caption ? ` (${caption})` : ""}`}
                    className="hover:bg-muted/60 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm pointer-coarse:min-h-11"
                  >
                    <PlusIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
                    <span className={caption ? "shrink-0" : "min-w-0 truncate"}>{card.name}</span>
                    {caption && (
                      <span className="text-muted-foreground min-w-0 truncate text-xs">
                        {caption}
                      </span>
                    )}
                  </button>
                </CardNamePreview>
              </li>
            );
          })}
        </ul>
      )}
      {shown.kind === "done" && left > 0 && (
        <Button
          variant="ghost"
          size="xs"
          className="mt-1"
          disabled={shown.more === "loading"}
          aria-busy={shown.more === "loading" || undefined}
          onClick={() => void showMore()}
        >
          {shown.more === "failed"
            ? "Couldn't load more. Try again"
            : `Show ${Math.min(left, SEARCH_LIMIT)} more`}
        </Button>
      )}
    </div>
  );
}
