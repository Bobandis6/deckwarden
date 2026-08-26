/**
 * Client-side persistence for the deck-view toggles (P1.3): view mode, group
 * key, sort key. Pure UI preference — the deck itself stays server-side
 * (CLAUDE.md), so localStorage is the right home. One global preference, not
 * per-deck: how you like reading decks doesn't change per deck.
 *
 * Absent fields fall back at the call site (groupBy to the adapter's
 * defaultGroupBy), so a stored preference never overrides a game's default
 * with a stale key from another game's session. localStorage is wrapped in
 * try/catch like token-store.ts — private modes throw.
 */
import { GROUP_KEYS, SORT_KEYS, type GroupKey, type SortKey } from "@/lib/decks/view-model";

export const VIEW_MODES = ["text", "grid"] as const;
export type DeckViewMode = (typeof VIEW_MODES)[number];

export interface DeckViewPrefs {
  view?: DeckViewMode;
  groupBy?: GroupKey;
  sortBy?: SortKey;
}

const KEY = "deckwarden:deck-view";

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** Validate a raw stored string field-by-field; unknown values drop out. */
export function parseViewPrefs(raw: string | null): DeckViewPrefs {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const prefs: DeckViewPrefs = {};
    const view = pick(record.view, VIEW_MODES);
    const groupBy = pick(record.groupBy, GROUP_KEYS);
    const sortBy = pick(record.sortBy, SORT_KEYS);
    if (view) prefs.view = view;
    if (groupBy) prefs.groupBy = groupBy;
    if (sortBy) prefs.sortBy = sortBy;
    return prefs;
  } catch {
    return {};
  }
}

export function loadViewPrefs(): DeckViewPrefs {
  if (typeof window === "undefined") return {};
  try {
    return parseViewPrefs(window.localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

export function saveViewPrefs(prefs: Required<DeckViewPrefs>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable — the toggles still work for this page view.
  }
}
