/**
 * The first-approval offers store (Y2b): validated on read, newest kept
 * under the cap, idempotent marks, and a working page view when storage
 * throws — the appearance store's guarantees for a nudge flag.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  markShareOffered,
  parseShareOffers,
  SHARE_OFFERS_CAP,
  SHARE_OFFERS_KEY,
  useShareOffered,
} from "./share-offers";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("parseShareOffers", () => {
  it("anything unreadable is no offers at all", () => {
    expect(parseShareOffers(null)).toEqual([]);
    expect(parseShareOffers("{")).toEqual([]);
    expect(parseShareOffers('{"deck-1":true}')).toEqual([]);
    expect(parseShareOffers('["deck-1", 7, "", null, "deck-2"]')).toEqual(["deck-1", "deck-2"]);
  });

  it("keeps the newest ids under the cap", () => {
    const ids = Array.from({ length: SHARE_OFFERS_CAP + 5 }, (_, i) => `deck-${i}`);
    const kept = parseShareOffers(JSON.stringify(ids));
    expect(kept).toHaveLength(SHARE_OFFERS_CAP);
    expect(kept[0]).toBe("deck-5");
  });
});

describe("markShareOffered + useShareOffered", () => {
  it("records once, drops the oldest past the cap, and the reader follows at once", () => {
    const hook = renderHook(() => useShareOffered("deck-1"));
    expect(hook.result.current).toBe(false);
    act(() => {
      markShareOffered("deck-1");
      markShareOffered("deck-1");
    });
    expect(JSON.parse(window.localStorage.getItem(SHARE_OFFERS_KEY)!)).toEqual(["deck-1"]);
    expect(hook.result.current).toBe(true);

    act(() => {
      for (let i = 0; i < SHARE_OFFERS_CAP; i++) markShareOffered(`other-${i}`);
    });
    const stored: string[] = JSON.parse(window.localStorage.getItem(SHARE_OFFERS_KEY)!);
    expect(stored).toHaveLength(SHARE_OFFERS_CAP);
    expect(stored).not.toContain("deck-1");
  });

  it("no deck yet reads false, never unknown", () => {
    expect(renderHook(() => useShareOffered(null)).result.current).toBe(false);
  });

  it("storage that throws still counts the offer for this page view", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    markShareOffered("deck-9");
    expect(renderHook(() => useShareOffered("deck-9")).result.current).toBe(true);
  });
});
