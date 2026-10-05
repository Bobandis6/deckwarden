"use client";

/**
 * The bracket read's combo facts, fetched (Y4a, WAVE4 D5): one GET
 * /api/combos/complete per settled id SET, whenever a commander is present —
 * drafts, saved and private decks alike, never a POST (the seeded drafts'
 * zero-POST pins hold).
 *
 * Its own settle, not autosave's: the facts depend on the id set alone, so
 * they wait out a 500 ms debounce after the set last changed and nothing
 * else — a draft that never saves, or an autosave that failed, still gets
 * its read. The first answer is asked for at once. Quantities, zones, tags
 * and printings don't change the set, so they never ask (deckStateKey's
 * policy, narrowed to ids). A request for an older set is aborted when the
 * set moves on; a failed set waits for Retry instead of asking again.
 *
 * `combos` and `freshness` are the newest answer — possibly for an older
 * set while `state` is "checking". The read may use them: it re-checks
 * every combo against the list, so an older answer can only miss a combo,
 * never count one that's gone — and the line says "Checking combos…"
 * meanwhile. Over FACTS_MAX_IDS distinct cards nothing is asked ("over"):
 * the read then says it couldn't check combos.
 */
import { useCallback, useEffect, useState } from "react";

import { FACTS_MAX_IDS, factsPath, parseFacts, type BracketFactsState } from "@/lib/brackets/facts";
import type { BracketFreshness, CompleteCombo, GameId } from "@/lib/games/types";

/** How long the id set must hold still before it is asked about. */
export const FACTS_DEBOUNCE_MS = 500;

export interface BracketFacts {
  state: BracketFactsState;
  combos: readonly CompleteCombo[] | null;
  freshness: BracketFreshness | null;
  /** Ask again for the set that failed. */
  retry: () => void;
}

interface Answer {
  key: string;
  combos: CompleteCombo[];
  freshness: BracketFreshness;
}

export function useBracketFacts({
  game,
  enabled,
  ids,
}: {
  game: GameId;
  /** The game declares a read and the list has a commander. */
  enabled: boolean;
  /** Every distinct card id in the list, sorted (factsIds). */
  ids: readonly string[];
}): BracketFacts {
  const key = ids.join(",");
  const over = ids.length > FACTS_MAX_IDS;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const answeredKey = answer?.key ?? null;
  const first = answer === null;

  useEffect(() => {
    if (!enabled || over || key === "" || key === answeredKey || key === failedKey) return;
    const controller = new AbortController();
    const ask = async () => {
      try {
        const res = await fetch(factsPath(game, key.split(",")), { signal: controller.signal });
        if (!res.ok) throw new Error(`Combo facts failed (${res.status}).`);
        const body = parseFacts(await res.json());
        if (!body) throw new Error("Combo facts came back malformed.");
        if (controller.signal.aborted) return;
        setAnswer({ key, ...body });
      } catch {
        if (controller.signal.aborted) return;
        setFailedKey(key);
      }
    };
    if (first) {
      void ask();
      return () => controller.abort();
    }
    const timer = setTimeout(() => void ask(), FACTS_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, over, key, answeredKey, failedKey, first, game]);

  const retry = useCallback(() => setFailedKey(null), []);

  const state: BracketFactsState = !enabled
    ? "off"
    : over
      ? "over"
      : failedKey === key
        ? "failed"
        : answeredKey === key
          ? "ready"
          : "checking";
  return {
    state,
    // A set that failed or was never asked about has no combos to show —
    // an older answer would look checked. Freshness doesn't depend on the
    // set, so the newest one stands.
    combos: state === "failed" || state === "over" ? null : (answer?.combos ?? null),
    freshness: answer?.freshness ?? null,
    retry,
  };
}
