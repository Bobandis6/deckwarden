/**
 * The `?printing=` view state (W5, WAVE2.md D4): which printing the card
 * page's hero shows. View state, never deck state — written with
 * `history.replaceState` so back/forward gain no entries, read through
 * `useSyncExternalStore` with a NULL SERVER SNAPSHOT (the leader-pick-intent
 * discipline): /cards/[id] is ISR and its server HTML must stay the default
 * printing's — the island restores the deep link after hydration. Never
 * `useSearchParams` — that would drag the route out of ●. The canonical tag
 * ignores this param by construction (generateMetadata never reads it).
 */
import { useSyncExternalStore } from "react";

export const PRINTING_PARAM = "printing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a location.search string; anything but a well-formed printing id is
 * null. Pure — the unit tests feed it raw strings.
 */
export function parsePrintingParam(search: string): string | null {
  const value = new URLSearchParams(search).get(PRINTING_PARAM);
  return value && UUID_RE.test(value) ? value : null;
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Pin a printing into the URL (null = back to default, param removed).
 * replaceState, never push: reload reproduces the view, back/forward don't
 * gain entries.
 */
export function writePrintingParam(printingId: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (printingId === null) url.searchParams.delete(PRINTING_PARAM);
  else url.searchParams.set(PRINTING_PARAM, printingId);
  window.history.replaceState(window.history.state, "", url);
  notify();
}

// useSyncExternalStore needs a stable snapshot between store changes: cache
// the parsed value by the raw search string.
let cachedSearch: string | null = null;
let cachedId: string | null = null;

function getSnapshot(): string | null {
  const search = window.location.search;
  if (search !== cachedSearch) {
    cachedSearch = search;
    cachedId = parsePrintingParam(search);
  }
  return cachedId;
}

function getServerSnapshot(): string | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // replaceState fires no event (notify() covers our own writes); popstate
  // covers bfcache restores and history traversal that changes the search.
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

/** The URL's printing id — null on the server, until hydration, and without the param. */
export function usePrintingParam(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
