"use client";

/**
 * The token fill in the editor (TOKEN-FILL): the tokens the deck's cards
 * make (src/lib/decks/token-fill.ts over `adapter.tokenLinks`, Magic's
 * Scryfall `all_parts`), shown as part of the Tokens list without a click,
 * minus the keys the deck holds as rows and the keys the owner hid — the
 * hidden ones still linked come back as the chips that undo the choice.
 *
 * The keys ride on the cards the editor already holds, so the count on the
 * heading costs no request. The token cards themselves hydrate through
 * POST /api/cards/resolve's id pass (an oracle id names exactly one
 * object), shown and hidden keys in ONE call — only while the section is
 * open, one request per new set of keys, each key kept for the session. A
 * key that resolves to nothing (a token gone upstream) is never asked twice.
 *
 * The share page's private-gate path uses the same hook (the server page
 * loads the fill itself, token-fill-load.ts).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { toEditorCard, type CardWire, type EditorCard } from "@/lib/decks/editor-state";
import { tokenFill } from "@/lib/decks/token-fill";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

export interface TokenFillRow {
  card: EditorCard;
  /** The playable cards that make or use it, name order. */
  from: string[];
}

export type TokenFillState = "idle" | "loading" | "failed";

export interface TokenFillResult {
  /** Derived tokens the list shows — known without a request. */
  count: number;
  /** The shown rows, hydrated: name order, then caption. */
  items: TokenFillRow[];
  /** The hidden tokens the cards still link, hydrated — the chips. */
  hidden: TokenFillRow[];
  state: TokenFillState;
  retry: () => void;
}

const NO_ROWS: TokenFillRow[] = [];

export function useTokenFill({
  adapter,
  format,
  entries,
  cards,
  hidden,
  enabled,
}: {
  /** Null (an unknown game on the share page) fills nothing. */
  adapter: GameAdapter | null;
  format: FormatDef | undefined;
  entries: readonly { cardId: string; zone: string }[];
  cards: ReadonlyMap<string, EditorCard>;
  /** The deck's hidden keys (decks.hidden_tokens); null = none. */
  hidden: readonly string[] | null;
  /** The section is open: only then do the token cards load. */
  enabled: boolean;
}): TokenFillResult {
  const fill = useMemo(
    () =>
      adapter && format
        ? tokenFill({ adapter, format, entries, cards, hidden })
        : { shown: new Map<string, string[]>(), hidden: new Map<string, string[]>() },
    [adapter, format, entries, cards, hidden],
  );
  // Both sets in one resolve; a stable string so the effect keys on the set, not the array.
  const wantKey = [...fill.shown.keys(), ...fill.hidden.keys()].sort().join(",");

  const [hydrated, setHydrated] = useState<ReadonlyMap<string, EditorCard>>(() => new Map());
  const [state, setState] = useState<TokenFillState>("idle");
  const [nonce, setNonce] = useState(0);
  const goneRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !adapter || !format || wantKey === "") return;
    const want = wantKey.split(",").filter((k) => !hydrated.has(k) && !goneRef.current.has(k));
    if (want.length === 0) return;
    const controller = new AbortController();
    // Every state write happens in the timer's callback, never in the effect body.
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch("/api/cards/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ game: adapter.id, format: format.code, names: want }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json: { results: { match: CardWire | null }[] } = await res.json();
        const found = new Map<string, EditorCard>();
        want.forEach((key, i) => {
          const match = json.results[i]?.match;
          // The id guard (use-resolved-add's honesty check): the key must come back as itself.
          if (match && match.externalKey === key) found.set(key, toEditorCard(match));
          else goneRef.current.add(key);
        });
        setHydrated((prev) => new Map([...prev, ...found]));
        setState("idle");
      } catch {
        if (!controller.signal.aborted) setState("failed");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, wantKey, hydrated, adapter, format, nonce]);

  const { items, hiddenRows } = useMemo(() => {
    const caption = (c: EditorCard) => adapter?.display.tokenCaption?.(c) ?? "";
    const rows = (keys: ReadonlyMap<string, string[]>): TokenFillRow[] => {
      const out: TokenFillRow[] = [];
      for (const [key, from] of keys) {
        const card = hydrated.get(key);
        if (card) out.push({ card, from });
      }
      if (out.length === 0) return NO_ROWS;
      return out.sort(
        (a, b) =>
          a.card.name.localeCompare(b.card.name) || caption(a.card).localeCompare(caption(b.card)),
      );
    };
    return { items: rows(fill.shown), hiddenRows: rows(fill.hidden) };
  }, [fill, hydrated, adapter]);

  return {
    count: fill.shown.size,
    items,
    hidden: hiddenRows,
    state,
    retry: () => {
      setState("idle");
      setNonce((n) => n + 1);
    },
  };
}
