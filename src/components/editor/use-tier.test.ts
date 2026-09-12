/**
 * useTier (R4): the tier from the two media lists — `phone` below 48rem,
 * `md` from it, `wide` from 75rem — re-read on either list's change event,
 * and a `wide` server snapshot (the editor is client-only on both routes,
 * so it never paints; it only has to exist).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MD_QUERY, readTier, useTier, WIDE_QUERY } from "./use-tier";

type Listener = () => void;

/** A matchMedia stub whose lists flip together from one width. */
function stubViewport(width: number) {
  // One entry per (list, listener): the hook subscribes the same callback to both lists.
  const listeners: { query: string; fn: Listener }[] = [];
  let current = width;
  const matches = (query: string) =>
    query === WIDE_QUERY ? current >= 1200 : query === MD_QUERY ? current >= 768 : false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return matches(query);
      },
      media: query,
      addEventListener: (_: "change", fn: Listener) => {
        listeners.push({ query, fn });
      },
      removeEventListener: (_: "change", fn: Listener) => {
        const i = listeners.findIndex((l) => l.query === query && l.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    })),
  );
  return {
    resize(next: number) {
      current = next;
      for (const { fn } of [...listeners]) fn();
    },
    listeners,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTier", () => {
  it("maps 375 / 768 / 1199 / 1200 / 1440 to phone / md / md / wide / wide", () => {
    const viewport = stubViewport(375);
    expect(readTier()).toBe("phone");
    viewport.resize(768);
    expect(readTier()).toBe("md");
    viewport.resize(1199);
    expect(readTier()).toBe("md");
    viewport.resize(1200);
    expect(readTier()).toBe("wide");
    viewport.resize(1440);
    expect(readTier()).toBe("wide");
  });

  it("re-renders on a change event and unsubscribes on unmount", () => {
    const viewport = stubViewport(1440);
    const { result, unmount } = renderHook(() => useTier());
    expect(result.current).toBe("wide");
    act(() => viewport.resize(1024));
    expect(result.current).toBe("md");
    act(() => viewport.resize(375));
    expect(result.current).toBe("phone");
    expect(viewport.listeners).toHaveLength(2);
    unmount();
    expect(viewport.listeners).toHaveLength(0);
  });

  it("reads wide when matchMedia is missing (the server snapshot's value)", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(readTier()).toBe("wide");
  });
});
