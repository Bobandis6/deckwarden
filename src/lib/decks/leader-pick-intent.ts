/**
 * The leader pick intent (W4, WAVE2.md D3): the sessionStorage note that
 * turns "Browse commanders" from a SAVED deck into a round trip. Written on
 * the Browse click only when a server deck row exists (draft mode keeps
 * plain navigation — the P4.6 `?leader=` seed covers it), read by the
 * /commanders and /leaders banner, the hub CTA island, and the editor's
 * `?leader=` apply. 30-minute TTL; cleared on apply and on the banner's
 * Cancel.
 *
 * The store follows `src/lib/hub/index-view.ts`'s useSyncExternalStore
 * discipline with one deliberate difference: the SERVER snapshot is null —
 * hub pages are ISR/static and their server HTML must stay byte-identical
 * (smokes grep it), so the banner and the "Use for" CTA appear only after
 * hydration. sessionStorage, not localStorage: the intent is one tab's
 * errand, not a preference.
 */
import { useSyncExternalStore } from "react";

import type { GameId } from "@/lib/games/types";

export const PICK_INTENT_KEY = "deckwarden:leader-pick-intent";
export const PICK_INTENT_TTL_MS = 30 * 60_000;

export interface LeaderPickIntent {
  deckId: string;
  deckName: string;
  game: GameId;
  /** Epoch ms of the Browse click — the TTL clock. */
  at: number;
}

/**
 * Parse a stored value; anything malformed or older than the TTL is null.
 * Pure — the unit tests feed it raw strings and clocks directly.
 */
export function parsePickIntent(raw: string | null, now: number): LeaderPickIntent | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { deckId, deckName, game, at } = value as Record<string, unknown>;
  if (typeof deckId !== "string" || deckId === "") return null;
  if (typeof deckName !== "string") return null;
  if (typeof game !== "string" || game === "") return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (now - at > PICK_INTENT_TTL_MS) return null;
  return { deckId, deckName, game: game as GameId, at };
}

/** Last value written this page view — the fallback when storage throws. */
let memoryRaw: string | null = null;

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PICK_INTENT_KEY);
  } catch {
    return memoryRaw;
  }
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Write the intent (Browse click on a saved deck); `at` is stamped here. */
export function writePickIntent(intent: Omit<LeaderPickIntent, "at">): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify({ ...intent, at: Date.now() });
  memoryRaw = raw;
  try {
    window.sessionStorage.setItem(PICK_INTENT_KEY, raw);
  } catch {
    // Storage unavailable — the intent still holds for this page view.
  }
  notify();
}

/** Clear the intent (apply, or the banner's Cancel). */
export function clearPickIntent(): void {
  if (typeof window === "undefined") return;
  memoryRaw = null;
  try {
    window.sessionStorage.removeItem(PICK_INTENT_KEY);
  } catch {
    // Ditto — memoryRaw is already gone.
  }
  notify();
}

/** The current un-expired intent, or null. */
export function readPickIntent(now: number = Date.now()): LeaderPickIntent | null {
  return parsePickIntent(readRaw(), now);
}

/**
 * The intent IF it names this exact deck and game — the editor's `?leader=`
 * guard (a crafted link with no matching intent must change nothing).
 */
export function pickIntentFor(
  deckId: string,
  game: GameId,
  now: number = Date.now(),
): LeaderPickIntent | null {
  const intent = readPickIntent(now);
  if (!intent || intent.deckId !== deckId || intent.game !== game) return null;
  return intent;
}

// useSyncExternalStore needs a stable snapshot between store changes: cache
// the parsed object by its raw string, and let only expiry flip it to null.
let cachedRaw: string | null = null;
let cachedIntent: LeaderPickIntent | null = null;

function getSnapshot(): LeaderPickIntent | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedIntent = parsePickIntent(raw, Date.now());
  }
  if (cachedIntent && Date.now() - cachedIntent.at > PICK_INTENT_TTL_MS) return null;
  return cachedIntent;
}

function getServerSnapshot(): LeaderPickIntent | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PICK_INTENT_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The tab's fresh same-game intent — null on the server and until hydration
 * (the banner/CTA islands render nothing into server HTML).
 */
export function usePickIntent(game: GameId): LeaderPickIntent | null {
  const intent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return intent !== null && intent.game === game ? intent : null;
}
