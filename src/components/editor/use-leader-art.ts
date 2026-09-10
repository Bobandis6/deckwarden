"use client";

/**
 * useLeaderArt (R2, REDESIGN.md §3): the builder's one art request per
 * leader change. Inputs are the art leader's card and chosen printing plus
 * an `enabled` gate (the adapter declares art AND the reader keeps
 * Background art on); the preview card, main-deck edits, tags, the tabs —
 * none of them are inputs, so none of them can refetch.
 *
 * Contract: fetch only when (cardId, printingId) changes; the crop is
 * decoded off-screen before it is committed, so the crossfade starts on a
 * painted image; a stale request never wins — each effect run owns its
 * request and is cancelled (AbortController) the moment the inputs change
 * or the hook unmounts, and a late response for an earlier leader is
 * dropped. Between a change and its commit the LAST committed art stays
 * up (that is the crossfade); removing the last leader drops it at once.
 * Turning the preference off keeps the committed art in state, so turning
 * it back on shows it again without a request. Nothing here touches deck
 * state or autosave.
 */
import { useEffect, useState } from "react";

import type { CardArt } from "@/lib/cards/art";
import { artRequestPath, artTargetKey } from "@/lib/decks/ambient-art";

interface Committed {
  key: string;
  art: CardArt | null;
}

/** Decode the crop off-screen; rejects when the browser cannot load it. */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      // decode() can reject for a perfectly good image (memory pressure);
      // the load already succeeded, so treat that as ready.
      const decoded = typeof img.decode === "function" ? img.decode() : Promise.resolve();
      decoded.then(resolve, () => resolve());
    };
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

export function useLeaderArt({
  enabled,
  cardId,
  printingId,
}: {
  enabled: boolean;
  cardId: string | null;
  printingId: string | null;
}): CardArt | null {
  const key = cardId ? artTargetKey({ cardId, printingId }) : null;
  // The previous-render pattern (no refs during render): a leader change
  // keeps the last committed art up until the replacement has loaded;
  // removing the last leader clears it immediately.
  const [seen, setSeen] = useState<{ key: string | null; committed: Committed | null }>({
    key,
    committed: null,
  });
  if (seen.key !== key) {
    setSeen({ key, committed: key === null ? null : seen.committed });
  }

  useEffect(() => {
    if (!enabled || !cardId) return;
    const target = { cardId, printingId };
    const wanted = artTargetKey(target);
    if (seen.committed?.key === wanted) return;
    const controller = new AbortController();
    let stale = false;
    // Set once the body is read: the cleanup then has nothing to cancel, and
    // a finished request is never marked aborted in the browser's log.
    let done = false;
    const commit = (art: CardArt | null) => {
      if (stale) return;
      setSeen((current) => ({ ...current, committed: { key: wanted, art } }));
    };
    void (async () => {
      try {
        const res = await fetch(artRequestPath(target), { signal: controller.signal });
        if (!res.ok) {
          done = true;
          commit(null);
          return;
        }
        const json: { art: CardArt | null } = await res.json();
        done = true;
        if (!json.art) {
          commit(null);
          return;
        }
        await preloadImage(json.art.url);
        commit(json.art);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        commit(null);
      }
    })();
    return () => {
      stale = true;
      if (!done) controller.abort();
    };
  }, [enabled, cardId, printingId, seen.committed]);

  if (!enabled || key === null) return null;
  return seen.committed?.art ?? null;
}
