"use client";

/**
 * "Is this a Mac?" for keycap hints (Y2a): ⌘ instead of Ctrl. Decided after
 * hydration — the server snapshot is false, so the server HTML and the first
 * client render agree on "Ctrl" and the swap happens without a mismatch
 * (useSyncExternalStore re-renders with the client snapshot). The platform
 * never changes mid-session, so there is nothing to subscribe to.
 */
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function isMacPlatform(nav: Pick<Navigator, "platform" | "userAgent">): boolean {
  return /Mac|iPhone|iPad|iPod/.test(nav.platform || nav.userAgent);
}

export function useIsMac(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isMacPlatform(navigator),
    () => false,
  );
}
