"use client";

/**
 * The panels' one add path (promoted from the Suggestions panel when the
 * Combo Radar became its second consumer — P3.3): hydrate a slim
 * {cardId, name} payload to a full editor card via /api/cards/resolve (which
 * also returns this format's legality, so an illegal add is flagged by live
 * validation immediately), then hand it to the editor's own add callback —
 * never a parallel write path.
 *
 * The id guard is the honesty check: the name came from our own card table,
 * so a resolve that returns a different id would silently add a different
 * card than shown — fail instead. Resolve is rate-limited 20/min per IP,
 * fine for click-paced adds; the per-card cache keeps retries and re-adds
 * free.
 */
import { useRef, useState } from "react";

import { toEditorCard, type CardWire, type EditorCard } from "@/lib/decks/editor-state";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

export interface PanelNotice {
  text: string;
  tone: "ok" | "err";
}

export function useResolvedAdd(
  adapter: GameAdapter,
  format: FormatDef,
  onAdd: (card: EditorCard) => string | undefined,
) {
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const cacheRef = useRef(new Map<string, EditorCard>());

  const add = async (target: { cardId: string; name: string }) => {
    setPendingAdd(target.cardId);
    setNotice(null);
    try {
      let card = cacheRef.current.get(target.cardId);
      if (!card) {
        const res = await fetch("/api/cards/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: adapter.id, format: format.code, names: [target.name] }),
        });
        if (!res.ok) throw new Error(`Couldn't load ${target.name} (${res.status}).`);
        const json: { results: { match: CardWire | null }[] } = await res.json();
        const match = json.results[0]?.match;
        if (!match || match.id !== target.cardId) {
          throw new Error(`Couldn't load ${target.name} — try adding it from search.`);
        }
        card = toEditorCard(match);
        cacheRef.current.set(target.cardId, card);
      }
      const error = onAdd(card);
      setNotice(
        error ? { text: error, tone: "err" } : { text: `Added ${target.name}`, tone: "ok" },
      );
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Add failed — check your connection.",
        tone: "err",
      });
    } finally {
      setPendingAdd(null);
    }
  };

  return { pendingAdd, notice, add };
}
