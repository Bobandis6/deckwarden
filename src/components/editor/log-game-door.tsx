"use client";

/**
 * The on-demand Games dialog for the share page and `/account` (Y9b): one
 * `next/dynamic` import both doors share, client-only (it opens from a
 * tap; nothing to server-render). `preloadLogGameDialog` starts the chunk
 * ahead of the tap — the share page's owner row on mount, `/account` when
 * a tile's menu opens — so the first "Log a game" at a table opens at once.
 */
import dynamic from "next/dynamic";

export const LazyLogGameDialog = dynamic(() => import("@/components/editor/log-game-dialog"), {
  ssr: false,
});

/** Fetch the dialog's chunk now (cached: later calls and the lazy mount reuse it). */
export function preloadLogGameDialog(): void {
  void import("@/components/editor/log-game-dialog");
}
