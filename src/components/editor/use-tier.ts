"use client";

/**
 * The builder's layout tier (R4, REDESIGN.md §2 "Responsive structure"):
 * `phone` below 768 px, `md` from 768, `wide` from 1200 — the same two
 * thresholds the CSS uses (`md:` and the custom `wide:` variant), read
 * through matchMedia so the one thing CSS cannot decide (where the tools
 * content mounts, and what an explicit inspection opens) agrees with the
 * grid on screen. Widths themselves are never decided here.
 *
 * useSyncExternalStore: the editor is client-only on both routes, so the
 * server snapshot never paints — but it must exist, and it reads `wide`
 * (the desktop layout, the one every editor screenshot in the R-series
 * was taken at). Both lists are subscribed once; a change on either
 * re-reads both.
 */
import { useSyncExternalStore } from "react";

export type EditorTier = "phone" | "md" | "wide";

/** Tailwind's `md` (48rem) and the custom `wide` (75rem) — keep in step with globals.css. */
export const MD_QUERY = "(min-width: 48rem)";
export const WIDE_QUERY = "(min-width: 75rem)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const lists = [window.matchMedia(MD_QUERY), window.matchMedia(WIDE_QUERY)];
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

/** The tier for the current viewport (client only). */
export function readTier(): EditorTier {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "wide";
  if (window.matchMedia(WIDE_QUERY).matches) return "wide";
  if (window.matchMedia(MD_QUERY).matches) return "md";
  return "phone";
}

const serverTier = (): EditorTier => "wide";

export function useTier(): EditorTier {
  return useSyncExternalStore(subscribe, readTier, serverTier);
}
