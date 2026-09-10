/**
 * useLeaderArt (R2, REDESIGN.md §3): one request per (card, printing)
 * change and none for anything else; the crop decoded before it commits;
 * the stale guard — two responses landing out of order never let the
 * earlier leader's art win; the previous art staying up until the
 * replacement has loaded; removal clearing at once; Off keeping the art in
 * state so On needs no request; failures and null art committing null.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardArt } from "@/lib/cards/art";
import { useLeaderArt } from "./use-leader-art";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ALT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function art(url: string): CardArt {
  return {
    url,
    layout: "art_crop",
    artist: "Someone",
    credit: "Art: Someone · ™ & © Wizards of the Coast",
  };
}

interface Pending {
  url: string;
  signal: AbortSignal;
  resolve: (body: unknown, ok?: boolean) => void;
}

const pending: Pending[] = [];
const fetchMock = vi.fn((url: string, init: RequestInit) => {
  return new Promise((resolve) => {
    pending.push({
      url,
      signal: init.signal as AbortSignal,
      resolve: (body, ok = true) => resolve({ ok, json: async () => body }),
    });
  });
});

/** A controllable Image: `loaded()` fires onload, `failed()` fires onerror. */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "";
  src = "";
  constructor() {
    FakeImage.instances.push(this);
  }
  decode() {
    return Promise.resolve();
  }
}

/** Let the awaited fetch → json → preload chain advance. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settle(index: number, body: unknown, ok = true) {
  await act(async () => {
    pending[index].resolve(body, ok);
  });
  await flush();
}

async function loadLast() {
  await act(async () => {
    FakeImage.instances.at(-1)?.onload?.();
  });
  await flush();
}

beforeEach(() => {
  pending.length = 0;
  FakeImage.instances = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function hook(initial: { enabled: boolean; cardId: string | null; printingId: string | null }) {
  return renderHook((props) => useLeaderArt(props), { initialProps: initial });
}

describe("useLeaderArt", () => {
  it("no leader or disabled → no request; a leader → exactly one, with the chosen printing on the query", async () => {
    const { rerender, result } = hook({ enabled: true, cardId: null, printingId: null });
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: false, cardId: A, printingId: null });
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true, cardId: A, printingId: ALT });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pending[0].url).toBe(`/api/cards/${A}/art?printingId=${ALT}`);
    // Unrelated re-renders with the same inputs never refetch.
    rerender({ enabled: true, cardId: A, printingId: ALT });
    rerender({ enabled: true, cardId: A, printingId: ALT });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });

  it("commits only after the crop has loaded; Off hides it and On shows it again without a request", async () => {
    const { rerender, result } = hook({ enabled: true, cardId: A, printingId: null });
    await settle(0, { art: art("https://cards.scryfall.io/a.jpg") });
    expect(result.current).toBeNull(); // fetched, not yet decoded
    expect(FakeImage.instances.at(-1)?.src).toBe("https://cards.scryfall.io/a.jpg");
    await loadLast();
    expect(result.current?.url).toBe("https://cards.scryfall.io/a.jpg");

    rerender({ enabled: false, cardId: A, printingId: null });
    expect(result.current).toBeNull();
    rerender({ enabled: true, cardId: A, printingId: null });
    expect(result.current?.url).toBe("https://cards.scryfall.io/a.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the stale guard: the FINAL leader wins when two responses land out of order", async () => {
    const { rerender, result } = hook({ enabled: true, cardId: A, printingId: null });
    rerender({ enabled: true, cardId: B, printingId: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);
    // B answers first.
    await settle(1, { art: art("https://cards.scryfall.io/b.jpg") });
    await loadLast();
    expect(result.current?.url).toBe("https://cards.scryfall.io/b.jpg");
    // A's late answer — even loading its image — changes nothing.
    await settle(0, { art: art("https://cards.scryfall.io/a.jpg") });
    await act(async () => {
      for (const img of FakeImage.instances) img.onload?.();
    });
    await flush();
    expect(result.current?.url).toBe("https://cards.scryfall.io/b.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a swap keeps the previous art up until the replacement has loaded; removal clears at once", async () => {
    const { rerender, result } = hook({ enabled: true, cardId: A, printingId: null });
    await settle(0, { art: art("https://cards.scryfall.io/a.jpg") });
    await loadLast();
    expect(result.current?.url).toBe("https://cards.scryfall.io/a.jpg");

    rerender({ enabled: true, cardId: B, printingId: null });
    expect(result.current?.url).toBe("https://cards.scryfall.io/a.jpg"); // the crossfade waits
    await settle(1, { art: art("https://cards.scryfall.io/b.jpg") });
    expect(result.current?.url).toBe("https://cards.scryfall.io/a.jpg");
    await loadLast();
    expect(result.current?.url).toBe("https://cards.scryfall.io/b.jpg");

    rerender({ enabled: true, cardId: null, printingId: null });
    expect(result.current).toBeNull();
    // The same leader again is a new request (the removal cleared the state).
    rerender({ enabled: true, cardId: B, printingId: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("a non-OK response, null art, or a crop that fails to load commit null (the gradient)", async () => {
    const { rerender, result } = hook({ enabled: true, cardId: A, printingId: null });
    await settle(0, { error: "nope" }, false);
    expect(result.current).toBeNull();

    rerender({ enabled: true, cardId: B, printingId: null });
    await settle(1, { art: null });
    expect(result.current).toBeNull();
    expect(FakeImage.instances).toHaveLength(0);

    rerender({ enabled: true, cardId: A, printingId: ALT });
    await settle(2, { art: art("https://cards.scryfall.io/broken.jpg") });
    await act(async () => {
      FakeImage.instances.at(-1)?.onerror?.();
    });
    await flush();
    expect(result.current).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("unmounting aborts the request in flight", () => {
    const { unmount } = hook({ enabled: true, cardId: A, printingId: null });
    expect(pending[0].signal.aborted).toBe(false);
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
  });
});
