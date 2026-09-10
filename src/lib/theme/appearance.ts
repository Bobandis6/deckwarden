/**
 * Appearance preferences beyond the theme (R2, REDESIGN.md §3): one switch
 * today — Background art On / Off — stored under `deckwarden:appearance`
 * in localStorage like the deck-view toggles (view-prefs.ts): a reading
 * preference is the reader's, not the deck's, so it never touches the
 * server and never marks anything dirty. The value is validated field by
 * field; anything unreadable falls back to On (the default).
 *
 * `useAppearance` reads through useSyncExternalStore so the client-only
 * value never enters a server render: the SERVER snapshot is null
 * ("unknown"), and every ambient surface renders nothing until hydration
 * replaces it — an Off reader never sees a flash of art, and an On reader
 * sees the 250 ms fade they would see anyway. Same-tab changes notify every
 * subscriber synchronously; other tabs follow through the `storage` event.
 */
import { useSyncExternalStore } from "react";

export interface Appearance {
  backgroundArt: boolean;
}

export const APPEARANCE_KEY = "deckwarden:appearance";

export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({ backgroundArt: true });

/** Validate a raw stored string field by field; anything else is the default. */
export function parseAppearance(raw: string | null): Appearance {
  if (!raw) return { ...DEFAULT_APPEARANCE };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_APPEARANCE };
    const record = parsed as Record<string, unknown>;
    return {
      backgroundArt:
        typeof record.backgroundArt === "boolean"
          ? record.backgroundArt
          : DEFAULT_APPEARANCE.backgroundArt,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

/** Last value written this page view — the fallback when storage throws on reads or writes. */
let memoryRaw: string | null = null;

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(APPEARANCE_KEY);
  } catch {
    return memoryRaw;
  }
}

export function loadAppearance(): Appearance {
  return parseAppearance(readRaw());
}

const listeners = new Set<() => void>();

export function saveAppearance(next: Appearance): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(next);
  memoryRaw = raw;
  try {
    window.localStorage.setItem(APPEARANCE_KEY, raw);
  } catch {
    // Storage unavailable — the choice still holds for this page view.
  }
  for (const listener of listeners) listener();
}

// useSyncExternalStore needs a referentially stable snapshot: re-parse only
// when the stored string changed.
let cachedRaw: string | null | undefined;
let cachedValue: Appearance = { ...DEFAULT_APPEARANCE };

function getSnapshot(): Appearance {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parseAppearance(raw);
  }
  return cachedValue;
}

function getServerSnapshot(): Appearance | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === APPEARANCE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The reader's appearance; null on the server and until hydration ("unknown"). */
export function useAppearance(): Appearance | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
