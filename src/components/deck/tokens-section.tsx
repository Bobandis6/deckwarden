"use client";

/**
 * The Tokens section (DECK-TOKENS): a deck's tokens, emblems and game pieces
 * — the format's `holds: "tokens"` zone, outside the 100
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
 * The editor brings two ways in, both into the zone through its own add
 * path (`onAdd`): "From your cards" — the tokens the list's cards make or
 * use (use-token-suggestions.ts), each row naming those cards, one click or
 * Add all — and "Add a token", a search over the token catalog alone (GET
 * /api/cards/search?tokens=1). The heading tells a closed section how many
 * tokens the cards make that it lacks. The share page passes neither, and
 * renders the section only when the deck holds a token.
 */
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { CardNamePreview } from "@/components/deck/card-name-preview";
import { DeckGridView } from "@/components/deck/deck-grid-view";
import { DeckTextView, GROUP_HEADER_CLASS } from "@/components/deck/deck-text-view";
import type {
  TokenSuggestion,
  TokenSuggestionsState,
} from "@/components/deck/use-token-suggestions";
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

/** The token search's typed minimum and its page (a pick, not a browse). */
const SEARCH_MIN_CHARS = 2;
const SEARCH_LIMIT = 12;

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
  /** Editor: adds into the zone (one card, or Add all's several); an error line, or nothing. */
  onAdd?: (cards: EditorCard[]) => string | undefined;
  /** Editor: "From your cards" (use-token-suggestions.ts). */
  suggestions?: {
    count: number;
    items: TokenSuggestion[];
    state: TokenSuggestionsState;
    retry: () => void;
  };
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
  suggestions,
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
  const hint = suggestions && suggestions.count > 0 ? `${suggestions.count} from your cards` : null;

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
            {qty}
          </span>
          {hint && !open && <span className="text-muted-foreground text-xs">{hint}</span>}
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground size-3.5 motion-safe:transition-transform motion-safe:duration-[120ms] group-data-panel-open/trigger:rotate-180"
          />
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className="space-y-3">
        {suggestions && onAdd && (
          <FromYourCards adapter={adapter} suggestions={suggestions} onAdd={add} />
        )}
        {onAdd && <TokenSearch adapter={adapter} onAdd={(card) => add([card])} />}
        {error && (
          <p aria-live="polite" className="text-destructive text-xs">
            {error}
          </p>
        )}
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No tokens yet. They don&apos;t count toward the deck&apos;s size.
          </p>
        ) : view === "grid" ? (
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
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Tokens are never validated (they sit outside the playable list): no rows carry a severity. */
const NO_SEVERITY: ReadonlyMap<string, "error" | "warning"> = new Map();

function FromYourCards({
  adapter,
  suggestions,
  onAdd,
}: {
  adapter: GameAdapter;
  suggestions: NonNullable<TokensSectionProps["suggestions"]>;
  onAdd: (cards: EditorCard[]) => void;
}) {
  const headingId = useId();
  const { items, state, count, retry } = suggestions;
  if (count === 0) return null;
  return (
    <div data-slot="token-suggestions" aria-labelledby={headingId} role="group">
      <div className="flex items-center justify-between gap-2">
        <p id={headingId} className="type-label-xs text-muted-foreground">
          From your cards
        </p>
        {items.length > 1 && (
          <Button variant="ghost" size="xs" onClick={() => onAdd(items.map((s) => s.card))}>
            Add all {items.length}
          </Button>
        )}
      </div>
      {state === "failed" ? (
        <p className="text-muted-foreground text-sm">
          Couldn&apos;t load your cards&apos; tokens.{" "}
          <button
            type="button"
            onClick={retry}
            className="cursor-pointer underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
          >
            Retry
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {state === "loading" ? "Finding the tokens your cards make…" : null}
        </p>
      ) : (
        <ul className="mt-1">
          {items.map(({ card, from }) => {
            const words = adapter.display.tokenCaption?.(card);
            return (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onAdd([card])}
                  aria-label={`Add ${card.name}${words ? ` (${words})` : ""}, from ${from.join(", ")}`}
                  className="hover:bg-muted/60 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm pointer-coarse:min-h-11"
                >
                  <PlusIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
                  <span className={words ? "shrink-0" : "min-w-0 truncate"}>{card.name}</span>
                  {words && (
                    <span className="text-muted-foreground min-w-0 truncate text-xs">{words}</span>
                  )}
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-xs">
                    from {from.join(", ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; results: EditorCard[] }
  | { kind: "failed" };

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

  useEffect(() => {
    if (q.length < SEARCH_MIN_CHARS) return;
    const controller = new AbortController();
    // State writes only in the timer's callback (the set-state-in-effect rule).
    const timer = setTimeout(async () => {
      setSearch({ kind: "loading" });
      try {
        const params = new URLSearchParams({
          game: adapter.id,
          tokens: "1",
          name: q,
          sort: "best",
          limit: String(SEARCH_LIMIT),
        });
        const res = await fetch(`/api/cards/search?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json: { results: CardWire[] } = await res.json();
        setSearch({ kind: "done", results: json.results.map(toEditorCard) });
      } catch {
        if (!controller.signal.aborted) setSearch({ kind: "failed" });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, adapter.id]);

  const shown = q.length >= SEARCH_MIN_CHARS ? search : { kind: "idle" as const };
  return (
    <div data-slot="token-search">
      <Field className="max-w-sm">
        <FieldLabel>Add a token</FieldLabel>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Treasure, Soldier, The Monarch…"
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
              : null}
      </div>
      {shown.kind === "done" && shown.results.length > 0 && (
        <ul className="mt-1" aria-label="Tokens found">
          {shown.results.map((card) => {
            const words = adapter.display.tokenCaption?.(card);
            return (
              <li key={card.id}>
                <CardNamePreview name={card.name} image={card.image}>
                  <button
                    type="button"
                    onClick={() => onAdd(card)}
                    aria-label={`Add ${card.name}${words ? ` (${words})` : ""}`}
                    className="hover:bg-muted/60 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm pointer-coarse:min-h-11"
                  >
                    <PlusIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
                    <span className={words ? "shrink-0" : "min-w-0 truncate"}>{card.name}</span>
                    {words && (
                      <span className="text-muted-foreground min-w-0 truncate text-xs">
                        {words}
                      </span>
                    )}
                  </button>
                </CardNamePreview>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
