/**
 * The leader-index view preference (R5a, REDESIGN.md §2 "Commander and
 * leader indexes"): List or Grid under `deckwarden:index-view`, one value
 * for both indexes (how you like browsing leaders does not change per
 * game). Stored as the bare word; anything else reads as "list".
 *
 * `useIndexView` reads through useSyncExternalStore like the appearance
 * store (R2), with one deliberate difference: the SERVER snapshot is
 * "list", not null — the list must be in the server HTML (hubs-smoke greps
 * it, and it is what search engines index), so a Grid reader sees the list
 * for one paint and the grid after hydration. Same-tab saves notify every
 * subscriber synchronously; other tabs follow through the `storage` event;
 * an in-memory fallback covers storage that throws.
 */
import { useSyncExternalStore } from "react";

export const INDEX_VIEWS = ["list", "grid"] as const;
export type IndexView = (typeof INDEX_VIEWS)[number];

export const INDEX_VIEW_KEY = "deckwarden:index-view";
export const DEFAULT_INDEX_VIEW: IndexView = "list";

/** A stored value, validated; anything unreadable is the list. */
export function parseIndexView(raw: string | null): IndexView {
  return INDEX_VIEWS.includes(raw as IndexView) ? (raw as IndexView) : DEFAULT_INDEX_VIEW;
}

/** Last value written this page view — the fallback when storage throws on reads or writes. */
let memoryRaw: string | null = null;

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(INDEX_VIEW_KEY);
  } catch {
    return memoryRaw;
  }
}

export function loadIndexView(): IndexView {
  return parseIndexView(readRaw());
}

const listeners = new Set<() => void>();

export function saveIndexView(view: IndexView): void {
  if (typeof window === "undefined") return;
  memoryRaw = view;
  try {
    window.localStorage.setItem(INDEX_VIEW_KEY, view);
  } catch {
    // Storage unavailable — the choice still holds for this page view.
  }
  for (const listener of listeners) listener();
}

function getSnapshot(): IndexView {
  return loadIndexView();
}

function getServerSnapshot(): IndexView {
  return DEFAULT_INDEX_VIEW;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === INDEX_VIEW_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The reader's index view — "list" on the server and until hydration. */
export function useIndexView(): IndexView {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
