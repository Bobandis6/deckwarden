"use client";

/**
 * Quick-add search pane (P1.2) — the flagship keyboard flow (build plan §7):
 * type to search, ArrowUp/Down to move, Enter adds to the main zone,
 * Ctrl/Cmd+Enter adds to the leader zone, and a `4 Sol Ring` prefix sets the
 * quantity. Per-result buttons cover the same actions for the mouse.
 *
 * R3 (C5 / F6 / F14): a thin shell over the pure state machine in
 * src/lib/decks/search-state.ts — the same 200 ms debounce, the same
 * /api/cards/search params and result limit, but "No cards match" renders
 * only once a response says so, "Search failed" carries a Retry, and the
 * live line clears on the next input. Rows show a tiny full-card thumbnail
 * (never cropped; One Piece rows have had the mirror's small WebP since
 * P4.9, and a row without one keeps a same-width spacer), the Add /
 * Commander actions are visible on the ACTIVE row and on coarse pointers
 * (the listbox owns focus, so focus-within cannot), and the hint line is
 * keycaps. Successful adds are announced by the editor's toast (F3); the
 * pane's live line carries only rejections. The `/` and `?` keys live in
 * DeckEditor's useEditorHotkeys — the editor focuses this pane through its
 * ref.
 *
 * R4: two preview channels. Responses and arrow moves are PASSIVE
 * (`onPreview` — the detail pane updates silently, on a phone too); a
 * click or tap on a row is an EXPLICIT inspection (`onInspect`, falling
 * back to `onPreview`), which the editor turns into the phone's card sheet
 * or the md drawer. Add never opens anything, and after a successful add
 * the box takes focus back — the repeated-adds flow at every tier. Rows
 * and their actions grow to 44 px on coarse pointers (`pointer-coarse:`).
 *
 * Y2a (a quiet first screen): the keycap hint line renders on fine
 * pointers only — a phone has no keyboard to hint at — and says ⌘ on a Mac
 * (decided after hydration, `useIsMac`).
 *
 * Y7b (WAVE4 D8): at the deck's maximum (`swapIn`), the main-list add —
 * the row's button, Enter and a double-click — becomes "Swap in…": the
 * editor's swap-in sheet opens (`onSwapIn`) and nothing is added yet. The
 * leader's button keeps its add. Once the swap lands the editor clears the
 * box (`reset`) and the closing sheet hands it focus (`element`), like an add.
 *
 * U3b (WAVE5 D4): the sticky block is the chrome material, so the results
 * passing under it show through, softened, and the ambient art with them;
 * solid for a reader who asked for less transparency or more contrast.
 *
 * FRESH-UI-EDITOR (the Codex editor half, reconciled): the pane has a
 * visible title, "Find a card", in the deck pane's heading class and, like
 * its "Deck", sr-only on phones where the tab bar is the title (U4a). A
 * result row is a grid: the thumb, the name, then its meta (×N and the
 * pips) and the actions in one row at rest, so an unselected row on a fine
 * pointer keeps its geometry; on the SELECTED row, and on every row on a
 * coarse pointer (where the actions always show), the actions drop to a
 * second line under the name, right-aligned, so they never squeeze it; the
 * name keeps its line with its meta, and the pip column stays where every
 * other row has it. Hover reveals the actions inline as before: a layout
 * that moved under the pointer would change the row under it.
 *
 * Game knowledge (zone ids/labels, leader noun, pips, subtitles) comes off the
 * adapter — this component never mentions a specific game.
 */
import { RotateCwIcon } from "lucide-react";
import { useEffect, useImperativeHandle, useReducer, useRef, type Ref } from "react";

import { CardImage } from "@/components/cards/card-image";
import { CHROME_CLASS } from "@/components/chrome-material";
import { CostPips } from "@/components/deck/cost-pips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMac } from "@/components/use-is-mac";
import { Kbd } from "@/components/ui/kbd";
import { thumbnailUrl } from "@/lib/cards/images";
import { toEditorCard, type CardWire, type EditorCard } from "@/lib/decks/editor-state";
import { INITIAL_SEARCH_STATE, searchReducer } from "@/lib/decks/search-state";
import type { FormatDef, GameAdapter } from "@/lib/games/types";
import { cn } from "@/lib/utils";

const RESULT_LIMIT = 20;
const DEBOUNCE_MS = 200;

export interface SearchPaneHandle {
  focus(): void;
  /**
   * Put a message on the pane's live line (W4: why a `?leader=` pick was
   * not applied). Same channel as add rejections — clears on the next input.
   */
  announce(text: string, tone?: "ok" | "err"): void;
  /** Y7b: after a swap-in lands — clear the box, as an add does (the sheet hands focus back). */
  reset(): void;
  /** Y7b: the box itself — where a swap-in sheet sends focus once its swap lands. */
  element(): HTMLElement | null;
}

interface SearchPaneProps {
  adapter: GameAdapter;
  format: FormatDef;
  /** Total copies of a card already in the deck (any zone) — result badges. */
  inDeckQty: ReadonlyMap<string, number>;
  /** Returns an error message when the add is rejected (e.g. zone full). */
  onAdd: (card: EditorCard, zoneId: string, qty: number) => string | undefined;
  /** Passive: the first result of a response, the row under the arrow keys. */
  onPreview: (card: EditorCard) => void;
  /** Explicit: a click or tap on a row (R4); defaults to `onPreview`. */
  onInspect?: (card: EditorCard) => void;
  /** Y7b: the deck is at its maximum — a main-list add becomes "Swap in…" (`onSwapIn`). */
  swapIn?: boolean;
  onSwapIn?: (card: EditorCard, qty: number) => void;
  /** The editor's handle: `/` and "Choose commander" focus the box through it. */
  ref?: Ref<SearchPaneHandle>;
}

export function SearchPane({
  adapter,
  format,
  inDeckQty,
  onAdd,
  onPreview,
  onInspect,
  swapIn = false,
  onSwapIn,
  ref,
}: SearchPaneProps) {
  const [state, dispatch] = useReducer(searchReducer, INITIAL_SEARCH_STATE);
  const { status, raw, query, qty, results, sel, notice, requestId } = state;
  const inputRef = useRef<HTMLInputElement>(null);
  const onPreviewRef = useRef(onPreview);
  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      announce: (text, tone = "err") => dispatch({ type: "notice", notice: { text, tone } }),
      reset: () => dispatch({ type: "added" }),
      element: () => inputRef.current,
    }),
    [],
  );

  const mainZone = format.zones.find((z) => !z.isLeaderZone);
  const leaderZone = format.zones.find((z) => z.isLeaderZone);
  const leaderNoun = adapter.display.leaderNoun;
  const isMac = useIsMac();

  // Debounced fetch, keyed on the reducer's request token: every new query,
  // retry, add and clear mints a new one, so this effect runs exactly once
  // per decision, the previous fetch is aborted on the way, and a response
  // dispatches under the token it was sent with — the reducer drops any
  // other. Clearing on empty input is the reducer's (status idle).
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      dispatch({ type: "request" });
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
        if (controller.signal.aborted) return;
        const cards = json.results.map(toEditorCard);
        dispatch({ type: "response", id: requestId, results: cards });
        if (cards[0]) onPreviewRef.current(cards[0]);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          dispatch({ type: "failure", id: requestId });
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, requestId, adapter.id, format.code]);

  const add = (card: EditorCard, zoneId: string | undefined, count: number) => {
    if (!zoneId) return;
    const error = onAdd(card, zoneId, count);
    if (error) {
      dispatch({ type: "notice", notice: { text: error, tone: "err" } });
      return;
    }
    dispatch({ type: "added" });
    inputRef.current?.focus();
  };
  // The main-list add, or — at the deck's maximum — the swap-in sheet (Y7b).
  const swapping = swapIn && onSwapIn !== undefined;
  const addMain = (card: EditorCard, count: number) => {
    if (swapIn && onSwapIn) onSwapIn(card, count);
    else add(card, mainZone?.id, count);
  };

  const moveSel = (delta: number) => {
    if (results.length === 0) return;
    const next = (sel + delta + results.length) % results.length;
    dispatch({ type: "move", delta });
    onPreview(results[next]);
    document.getElementById(`search-result-${next}`)?.scrollIntoView?.({ block: "nearest" });
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
      if (e.ctrlKey || e.metaKey) add(card, leaderZone?.id, qty);
      else addMain(card, qty);
    } else if (e.key === "Escape") {
      dispatch({ type: "clear" });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Sticky (C12): the box, the keycap hint and the live line stay put
          while the results scroll under them inside the search section. */}
      <div className={cn(CHROME_CLASS, "sticky top-0 z-10 px-3 pt-3 pb-1")}>
        {/* The pane's title (FRESH-UI-EDITOR): the deck pane's heading class in a
            32 px row, so the two titles share one line (the deck pane's summary
            row is the ring's 32 px); on phones the tab is the title. */}
        <h2 className="mb-1 flex h-8 items-center text-sm font-semibold max-md:sr-only">
          Find a card
        </h2>
        {/* U10a (WAVE5.md D10): the Input primitive at the pane's 36 px; the
            combobox wiring passes through untouched (search-pane.test pins it). */}
        <Input
          ref={inputRef}
          type="text"
          value={raw}
          onChange={(e) => dispatch({ type: "input", raw: e.target.value })}
          onKeyDown={onKeyDown}
          placeholder={adapter.display.searchPlaceholder}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="quick-add-results"
          aria-activedescendant={results.length > 0 ? `search-result-${sel}` : undefined}
          aria-label="Card search"
          className="h-9 shrink-0 px-3"
        />
        <p
          data-slot="search-hints"
          className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 text-xs leading-5 pointer-coarse:hidden"
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> select
          </span>
          <span>
            <Kbd>Enter</Kbd> {swapping ? "swap in" : "add"}
          </span>
          {leaderZone && (
            <span>
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>+<Kbd>Enter</Kbd> add as {leaderNoun}
            </span>
          )}
          <span>“4 Name” sets quantity</span>
          <span>
            <Kbd>?</Kbd> shortcuts
          </span>
        </p>
        <p
          aria-live="polite"
          className={cn(
            "mt-1 min-h-5 text-xs",
            notice?.tone === "err" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {notice?.text}
        </p>
      </div>

      <ul
        id="quick-add-results"
        role="listbox"
        aria-label="Search results"
        className="space-y-0.5 px-3 pb-3"
      >
        {results.map((card, i) => {
          const owned = inDeckQty.get(card.id) ?? 0;
          const thumb = thumbnailUrl(card.image);
          return (
            <li
              key={card.id}
              id={`search-result-${i}`}
              role="option"
              aria-selected={i === sel}
              className={cn(
                // The row's grid (FRESH-UI-EDITOR): the thumb, the name, the meta; the
                // actions take an implicit fourth column when hover shows them inline.
                // Selected, or on a coarse pointer, the actions take a second row
                // under the name and its meta (gap-y only then).
                "group/row grid cursor-pointer grid-cols-[1.625rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1 text-sm aria-selected:gap-y-1 pointer-coarse:min-h-11 pointer-coarse:gap-y-1",
                // U3a: a press shows the hit (the selection's look) before the add's toast.
                i === sel
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/60 active:bg-accent active:text-accent-foreground",
              )}
              onClick={() => {
                dispatch({ type: "select", index: i });
                (onInspect ?? onPreview)(card);
              }}
              onDoubleClick={() => addMain(card, qty)}
            >
              {/* Thumbnail (F6): the full card at 36 px tall — never cropped —
                  in a box of that width whether or not an image exists, so
                  every row aligns (P4.9's One Piece thumbnails changed no layout). */}
              <span
                aria-hidden
                data-slot="thumb"
                className="h-9 w-[1.625rem] shrink-0 overflow-hidden rounded-[2px] group-aria-selected/row:row-span-2 pointer-coarse:row-span-2"
              >
                {thumb && (
                  <CardImage src={thumb} alt="" width={146} height={204} className="h-9 w-auto" />
                )}
              </span>
              {/* The name: one line beside its meta; the actions never share it once shown by state. */}
              <span data-slot="search-card-name" className="min-w-0 truncate">
                {card.name}
                {/* Printed-id chip (P4.6): OP names don't identify a card —
                    two Enel leaders exist; the chip is the disambiguator. */}
                {adapter.display.idBadge?.(card) && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    {adapter.display.idBadge(card)}
                  </span>
                )}
              </span>
              {/* The meta cell: ×N and the pips together, at the row's right edge like
                  every other row's pips, whichever line the actions take. */}
              <span data-slot="search-meta" className="flex shrink-0 items-center gap-2">
                {owned > 0 && (
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    ×{owned}
                  </span>
                )}
                <CostPips html={adapter.display.costHtml(card)} className="shrink-0 text-xs" />
              </span>
              {/* Actions on the active row and on touch (the spec's
                  group-aria-selected fix): hover still reveals them on the rest.
                  Selected or on touch they take the second row, right-aligned. */}
              <span
                data-slot="search-actions"
                className="hidden shrink-0 gap-1 group-aria-selected/row:col-start-2 group-aria-selected/row:col-end-4 group-aria-selected/row:row-start-2 group-aria-selected/row:flex group-aria-selected/row:justify-self-end group-hover/row:flex pointer-coarse:col-start-2 pointer-coarse:col-end-4 pointer-coarse:row-start-2 pointer-coarse:flex pointer-coarse:justify-self-end"
              >
                {mainZone && (
                  <Button
                    size="xs"
                    variant="secondary"
                    className="pointer-coarse:h-11 pointer-coarse:px-3"
                    aria-label={
                      swapping ? `Swap in ${card.name}…` : `Add ${card.name} to ${mainZone.label}`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      addMain(card, qty);
                    }}
                  >
                    {swapping ? "Swap in…" : "Add"}
                  </Button>
                )}
                {leaderZone && (
                  <Button
                    size="xs"
                    variant="secondary"
                    className="pointer-coarse:h-11 pointer-coarse:px-3"
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
      {status === "empty" && (
        <p className="text-muted-foreground px-3 pb-3 text-sm">No cards match “{query}”.</p>
      )}
      {status === "failed" && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 text-sm">
          <p className="text-destructive">Search failed. Check your connection.</p>
          <Button variant="outline" size="xs" onClick={() => dispatch({ type: "retry" })}>
            <RotateCwIcon aria-hidden />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
