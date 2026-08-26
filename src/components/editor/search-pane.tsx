"use client";

/**
 * Quick-add search pane (P1.2) — the flagship keyboard flow (build plan §7):
 * type to search, ArrowUp/Down to move, Enter adds to the main zone,
 * Ctrl/Cmd+Enter adds to the leader zone, and a `4 Sol Ring` prefix sets the
 * quantity. Per-result buttons cover the same actions for the mouse.
 *
 * Game knowledge (zone ids/labels, leader noun, pips, subtitles) comes off the
 * adapter — this component never mentions a specific game.
 */
import { useEffect, useRef, useState } from "react";

import { CostPips } from "@/components/deck/cost-pips";
import { Button } from "@/components/ui/button";
import {
  parseQuickAdd,
  toEditorCard,
  type CardWire,
  type EditorCard,
} from "@/lib/decks/editor-state";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

const RESULT_LIMIT = 20;

interface SearchPaneProps {
  adapter: GameAdapter;
  format: FormatDef;
  /** Total copies of a card already in the deck (any zone) — result badges. */
  inDeckQty: ReadonlyMap<string, number>;
  /** Returns an error message when the add is rejected (e.g. zone full). */
  onAdd: (card: EditorCard, zoneId: string, qty: number) => string | undefined;
  onPreview: (card: EditorCard) => void;
}

export function SearchPane({ adapter, format, inDeckQty, onAdd, onPreview }: SearchPaneProps) {
  const [raw, setRaw] = useState("");
  const [results, setResults] = useState<EditorCard[]>([]);
  const [sel, setSel] = useState(0);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onPreviewRef = useRef(onPreview);
  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);

  const { qty, query } = parseQuickAdd(raw);
  const mainZone = format.zones.find((z) => !z.isLeaderZone);
  const leaderZone = format.zones.find((z) => z.isLeaderZone);
  const leaderNoun = adapter.display.leaderNoun;

  // Debounced search on the parsed query (quantity prefix stripped). Clearing
  // on empty input happens in the change handler, not here — the effect only
  // synchronizes with the fetch.
  useEffect(() => {
    abortRef.current?.abort();
    if (!query) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          game: adapter.id,
          // Results carry this format's legality exceptions, so a banned card
          // added from search is flagged by live validation immediately (P1.4).
          format: format.code,
          name: query,
          limit: String(RESULT_LIMIT),
        });
        const res = await fetch(`/api/cards/search?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const json: { results: CardWire[] } = await res.json();
        const cards = json.results.map(toEditorCard);
        setResults(cards);
        setSel(0);
        if (cards[0]) onPreviewRef.current(cards[0]);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setMessage({ text: "Search failed — check your connection.", tone: "err" });
        }
      }
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, adapter.id, format.code]);

  // `/` focuses the search box from anywhere outside a text field.
  useEffect(() => {
    const onSlash = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onSlash);
    return () => window.removeEventListener("keydown", onSlash);
  }, []);

  const add = (card: EditorCard, zoneId: string | undefined, count: number) => {
    if (!zoneId) return;
    const zone = format.zones.find((z) => z.id === zoneId);
    const error = onAdd(card, zoneId, count);
    if (error) {
      setMessage({ text: error, tone: "err" });
      return;
    }
    const where = zone && zone.isLeaderZone ? ` as ${leaderNoun}` : "";
    setMessage({ text: `Added ${count > 1 ? `${count}× ` : ""}${card.name}${where}`, tone: "ok" });
    setRaw("");
    setResults([]);
    setSel(0);
    inputRef.current?.focus();
  };

  const moveSel = (delta: number) => {
    if (results.length === 0) return;
    const next = (sel + delta + results.length) % results.length;
    setSel(next);
    onPreview(results[next]);
    document.getElementById(`search-result-${next}`)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSel(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSel(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const card = results[sel];
      if (!card) return;
      add(card, e.ctrlKey || e.metaKey ? leaderZone?.id : mainZone?.id, qty);
    } else if (e.key === "Escape") {
      setRaw("");
      setResults([]);
    }
  };

  return (
    <div className="flex h-full flex-col p-3">
      <input
        ref={inputRef}
        type="text"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          if (!parseQuickAdd(e.target.value).query) {
            setResults([]);
            setSel(0);
          }
        }}
        onKeyDown={onKeyDown}
        placeholder="Add cards — try “4 Sol Ring”"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="quick-add-results"
        aria-activedescendant={results.length > 0 ? `search-result-${sel}` : undefined}
        aria-label="Card search"
        className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full shrink-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
      />
      <p className="text-muted-foreground mt-1.5 shrink-0 text-xs">
        ↑↓ select · Enter add{leaderZone ? ` · Ctrl+Enter add as ${leaderNoun}` : ""} · “4 Name”
        sets quantity{" "}
      </p>
      <p
        aria-live="polite"
        className={`mt-1 min-h-5 shrink-0 text-xs ${message?.tone === "err" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {message?.text}
      </p>

      <ul
        id="quick-add-results"
        role="listbox"
        aria-label="Search results"
        className="mt-1 space-y-0.5"
      >
        {results.map((card, i) => {
          const owned = inDeckQty.get(card.id) ?? 0;
          return (
            <li
              key={card.id}
              id={`search-result-${i}`}
              role="option"
              aria-selected={i === sel}
              className={`group/row flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${
                i === sel ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
              }`}
              onClick={() => {
                setSel(i);
                onPreview(card);
              }}
              onDoubleClick={() => add(card, mainZone?.id, qty)}
            >
              <span className="min-w-0 flex-1 truncate">{card.name}</span>
              {owned > 0 && (
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  ×{owned}
                </span>
              )}
              <CostPips html={adapter.display.costHtml(card)} className="shrink-0 text-xs" />
              <span className="hidden shrink-0 gap-1 group-hover/row:flex">
                {mainZone && (
                  <Button
                    size="xs"
                    variant="secondary"
                    aria-label={`Add ${card.name} to ${mainZone.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      add(card, mainZone.id, qty);
                    }}
                  >
                    Add
                  </Button>
                )}
                {leaderZone && (
                  <Button
                    size="xs"
                    variant="secondary"
                    aria-label={`Add ${card.name} as ${leaderNoun}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      add(card, leaderZone.id, 1);
                    }}
                  >
                    {leaderNoun}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {query && results.length === 0 && (
        <p className="text-muted-foreground mt-2 text-sm">No cards match “{query}”.</p>
      )}
    </div>
  );
}
