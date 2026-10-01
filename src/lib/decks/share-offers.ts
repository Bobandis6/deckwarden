/**
 * First-approval Share offers (Y2b, WAVE4 D2): the decks this browser has
 * already been offered "Share this deck" for, stored under
 * `deckwarden:share-offered` in localStorage the way the appearance store
 * keeps its switch (src/lib/theme/appearance.ts) — validated on read, a
 * page-view memory fallback when storage throws, same-tab subscribers told
 * synchronously and other tabs through the `storage` event. A browser-local
 * nudge flag, never deck data: nothing here reaches the server, and losing
 * it only means one more offer.
 *
 * The value is a JSON array of deck ids, oldest first, capped at
 * SHARE_OFFERS_CAP — a browser that builds more decks than that may be
 * offered again for its oldest, which costs one link.
 */
import { useSyncExternalStore } from "react";

export const SHARE_OFFERS_KEY = "deckwarden:share-offered";
export const SHARE_OFFERS_CAP = 100;

/** Validate a raw stored string: an array of non-empty id strings, newest kept. */
export function parseShareOffers(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64)
      .slice(-SHARE_OFFERS_CAP);
  } catch {
    return [];
  }
}

/** Last value written this page view — the fallback when storage throws. */
let memoryRaw: string | null = null;

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SHARE_OFFERS_KEY);
  } catch {
    return memoryRaw;
  }
}

const listeners = new Set<() => void>();

/** Record that `deckId` was offered "Share this deck" in this browser. Idempotent. */
export function markShareOffered(deckId: string): void {
  if (typeof window === "undefined") return;
  const offers = parseShareOffers(readRaw());
  if (offers.includes(deckId)) return;
  const raw = JSON.stringify([...offers, deckId].slice(-SHARE_OFFERS_CAP));
  memoryRaw = raw;
  try {
    window.localStorage.setItem(SHARE_OFFERS_KEY, raw);
  } catch {
    // Storage unavailable — the offer still counts for this page view.
  }
  for (const listener of listeners) listener();
}

// useSyncExternalStore needs a referentially stable snapshot: re-parse only
// when the stored string changed.
let cachedRaw: string | null | undefined;
let cachedOffers: ReadonlySet<string> = new Set();

function getOffers(): ReadonlySet<string> {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedOffers = new Set(parseShareOffers(raw));
  }
  return cachedOffers;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SHARE_OFFERS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Whether this browser was already offered Share for `deckId`: null on the
 * server and until hydration ("unknown"), false for no deck yet.
 */
export function useShareOffered(deckId: string | null): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => (deckId === null ? false : getOffers().has(deckId)),
    () => null,
  );
}
