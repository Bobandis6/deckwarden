"use client";

/**
 * "From your cards" (DECK-TOKENS): the tokens the playable list's cards link
 * to (`adapter.tokenLinks`, Magic's Scryfall `all_parts`) that the Tokens
 * zone doesn't hold yet, each with the names of the cards that make it. The
 * links ride on the cards the editor already holds, so the count costs no
 * request; the token cards themselves hydrate through POST /api/cards/resolve's
 * id pass (an oracle id names exactly one object) — only while the section
 * is open, one request per new set of keys, each key kept for the session.
 * A key that resolves to nothing (a token gone upstream) is never asked twice.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { toEditorCard, type CardWire, type EditorCard } from "@/lib/decks/editor-state";
import { playableEntries } from "@/lib/decks/playable";
import type { FormatDef, GameAdapter, ZoneDef } from "@/lib/games/types";

export interface TokenSuggestion {
  card: EditorCard;
  /** The playable cards that make or use it, name order. */
  from: string[];
}

export type TokenSuggestionsState = "idle" | "loading" | "failed";

export function useTokenSuggestions({
  adapter,
  format,
  zone,
  entries,
  cards,
  enabled,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  /** The format's token zone; absent = nothing to suggest. */
  zone: ZoneDef | undefined;
  entries: readonly { cardId: string; zone: string }[];
  cards: ReadonlyMap<string, EditorCard>;
  /** The section is open: only then do the token cards load. */
  enabled: boolean;
}): {
  /** Linked tokens the zone lacks — known without a request. */
  count: number;
  suggestions: TokenSuggestion[];
  state: TokenSuggestionsState;
  retry: () => void;
} {
  // Token key → the names of the playable cards linking it.
  const links = useMemo(() => {
    const byKey = new Map<string, string[]>();
    if (!zone || !adapter.tokenLinks) return byKey;
    for (const e of playableEntries(entries, format)) {
      const card = cards.get(e.cardId);
      if (!card) continue;
      for (const key of adapter.tokenLinks(card)) {
        const from = byKey.get(key) ?? [];
        if (!from.includes(card.name)) from.push(card.name);
        byKey.set(key, from);
      }
    }
    return byKey;
  }, [adapter, format, zone, entries, cards]);

  const missing = useMemo(() => {
    const held = new Set(
      entries
        .filter((e) => e.zone === zone?.id)
        .map((e) => cards.get(e.cardId)?.externalKey)
        .filter((k): k is string => k !== undefined),
    );
    return [...links.keys()].filter((k) => !held.has(k)).sort();
  }, [links, entries, cards, zone]);
  const missingKey = missing.join(",");

  const [hydrated, setHydrated] = useState<ReadonlyMap<string, EditorCard>>(() => new Map());
  const [state, setState] = useState<TokenSuggestionsState>("idle");
  const [nonce, setNonce] = useState(0);
  const goneRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || missingKey === "") return;
    const want = missingKey.split(",").filter((k) => !hydrated.has(k) && !goneRef.current.has(k));
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
  }, [enabled, missingKey, hydrated, adapter.id, format.code, nonce]);

  const suggestions = useMemo(() => {
    const out: TokenSuggestion[] = [];
    for (const key of missing) {
      const card = hydrated.get(key);
      if (card) out.push({ card, from: [...(links.get(key) ?? [])].sort() });
    }
    const caption = (c: EditorCard) => adapter.display.tokenCaption?.(c) ?? "";
    return out.sort(
      (a, b) =>
        a.card.name.localeCompare(b.card.name) || caption(a.card).localeCompare(caption(b.card)),
    );
  }, [missing, hydrated, links, adapter]);

  return {
    count: missing.length,
    suggestions,
    state,
    retry: () => {
      setState("idle");
      setNonce((n) => n + 1);
    },
  };
}
