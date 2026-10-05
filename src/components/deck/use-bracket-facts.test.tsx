/**
 * Y4a — useBracketFacts (WAVE4 D5): one GET per settled id SET while a
 * commander is present — the first at once, later ones after a 500 ms
 * debounce; a set that holds still never asks twice; a request for an
 * older set is aborted and never lands; a failed set waits for Retry; too
 * many cards asks nothing.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FACTS_DEBOUNCE_MS, useBracketFacts } from "./use-bracket-facts";

const A = "0a000000-0000-4000-8000-000000000001";
const B = "1b000000-0000-4000-8000-000000000002";
const C = "2c000000-0000-4000-8000-000000000003";

const freshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: { combos: { state: "ok", asOf: "2026-10-04T15:29:34.768Z" } },
};
const comboFor = (ids: string[]) => ({
  key: `k-${ids.length}`,
  cardPieces: ids,
  templates: [],
  tag: "C",
  relevant: true,
  results: [],
  popularity: 1,
});

const fetchMock = vi.fn();
const urls = () => fetchMock.mock.calls.map(([url]) => String(url));
const pathFor = (ids: string[]) => `/api/combos/complete?game=mtg&ids=${ids.join(",")}`;

/** Answers each request with one combo over its ids (so a test can tell answers apart). */
function answerAll() {
  fetchMock.mockImplementation(async (url: string) => {
    const ids = new URL(url, "http://x").searchParams.get("ids")!.split(",");
    return { ok: true, status: 200, json: async () => ({ combos: [comboFor(ids)], freshness }) };
  });
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function hook(initial: { enabled?: boolean; ids: string[] }) {
  return renderHook(
    ({ enabled, ids }: { enabled: boolean; ids: string[] }) =>
      useBracketFacts({ game: "mtg", enabled, ids }),
    { initialProps: { enabled: initial.enabled ?? true, ids: initial.ids } },
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockReset();
  answerAll();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useBracketFacts", () => {
  it("off asks nothing (no read for the game, or no commander yet)", async () => {
    const { result } = hook({ enabled: false, ids: [A, B] });
    await flush(2000);
    expect(result.current.state).toBe("off");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the first answer is asked for at once — one GET, the canonical URL, no POST", async () => {
    const { result } = hook({ ids: [A, B] });
    expect(result.current.state).toBe("checking");
    expect(urls()).toEqual([pathFor([A, B])]);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
    await flush();
    expect(result.current.state).toBe("ready");
    expect(result.current.combos).toEqual([comboFor([A, B])]);
    expect(result.current.freshness).toEqual(freshness);
  });

  it("a changed set says checking at once and asks after the debounce — one GET for a burst", async () => {
    const { result, rerender } = hook({ ids: [A] });
    await flush();
    rerender({ enabled: true, ids: [A, B] });
    expect(result.current.state).toBe("checking");
    // The older answer stays readable meanwhile (the read re-checks it).
    expect(result.current.combos).toEqual([comboFor([A])]);
    await flush(FACTS_DEBOUNCE_MS - 100);
    rerender({ enabled: true, ids: [A, B, C] });
    await flush(FACTS_DEBOUNCE_MS - 1);
    expect(urls()).toEqual([pathFor([A])]);
    await flush(1);
    expect(urls()).toEqual([pathFor([A]), pathFor([A, B, C])]);
    expect(result.current.state).toBe("ready");
    expect(result.current.combos).toEqual([comboFor([A, B, C])]);
  });

  it("the same set never asks twice — a new array, a quantity or a zone change is the same key", async () => {
    const { result, rerender } = hook({ ids: [A, B] });
    await flush();
    rerender({ enabled: true, ids: [A, B] });
    await flush(FACTS_DEBOUNCE_MS * 4);
    expect(urls()).toHaveLength(1);
    expect(result.current.state).toBe("ready");
    // Losing the commander and getting it back keeps the answer too.
    rerender({ enabled: false, ids: [A, B] });
    expect(result.current.state).toBe("off");
    rerender({ enabled: true, ids: [A, B] });
    await flush(FACTS_DEBOUNCE_MS * 2);
    expect(urls()).toHaveLength(1);
    expect(result.current.state).toBe("ready");
  });

  it("a request for an older set is aborted when the set moves on, and its answer never lands", async () => {
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
          release = () =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ combos: [comboFor([A])], freshness }),
            });
        }),
    );
    const { result, rerender } = hook({ ids: [A] });
    const firstSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    rerender({ enabled: true, ids: [A, B] });
    expect(firstSignal.aborted).toBe(true);
    release!();
    await flush(FACTS_DEBOUNCE_MS);
    expect(result.current.state).toBe("ready");
    expect(result.current.combos).toEqual([comboFor([A, B])]);
  });

  it("a debounced request in flight is aborted too when the set moves on again", async () => {
    const { result, rerender } = hook({ ids: [A] });
    await flush();
    let release: (() => void) | null = null;
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
          release = () =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ combos: [comboFor([A, B])], freshness }),
            });
        }),
    );
    rerender({ enabled: true, ids: [A, B] });
    await flush(FACTS_DEBOUNCE_MS);
    const inFlight = fetchMock.mock.calls[1][1].signal as AbortSignal;
    rerender({ enabled: true, ids: [A, B, C] });
    expect(inFlight.aborted).toBe(true);
    release!();
    await flush(FACTS_DEBOUNCE_MS);
    expect(urls()).toEqual([pathFor([A]), pathFor([A, B]), pathFor([A, B, C])]);
    expect(result.current.combos).toEqual([comboFor([A, B, C])]);
  });

  it("an answer whose body arrives after its set moved on is dropped — no out-of-order overwrite, no extra GET", async () => {
    let releaseBody: (() => void) | null = null;
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve) => {
          releaseBody = () => resolve({ combos: [comboFor([A])], freshness });
        }),
    }));
    const { result, rerender } = hook({ ids: [A] });
    await flush(); // the response is in; its body is not
    rerender({ enabled: true, ids: [A, B] });
    await flush(FACTS_DEBOUNCE_MS);
    expect(result.current.combos).toEqual([comboFor([A, B])]);
    releaseBody!();
    await flush(FACTS_DEBOUNCE_MS * 2);
    expect(result.current.state).toBe("ready");
    expect(result.current.combos).toEqual([comboFor([A, B])]);
    expect(urls()).toHaveLength(2);
  });

  it("an aborted request never marks a set failed — the set that replaced it still gets its answer", async () => {
    const releases: (() => void)[] = [];
    fetchMock.mockImplementation(
      (url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
          const ids = new URL(url, "http://x").searchParams.get("ids")!.split(",");
          releases.push(() =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ combos: [comboFor(ids)], freshness }),
            }),
          );
        }),
    );
    const { result, rerender } = hook({ ids: [A] });
    rerender({ enabled: true, ids: [A, B] });
    await flush();
    expect(result.current.state).toBe("checking");
    releases.at(-1)!();
    await flush(FACTS_DEBOUNCE_MS);
    expect(result.current.state).toBe("ready");
    expect(result.current.combos).toEqual([comboFor([A, B])]);
  });

  it("a set that fails after a good answer shows no combos — the older answer would look checked", async () => {
    const { result, rerender } = hook({ ids: [A] });
    await flush();
    expect(result.current.combos).toEqual([comboFor([A])]);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    rerender({ enabled: true, ids: [A, B] });
    await flush(FACTS_DEBOUNCE_MS);
    expect(result.current.state).toBe("failed");
    expect(result.current.combos).toBeNull();
    // Freshness doesn't depend on the set: the newest one stands.
    expect(result.current.freshness).toEqual(freshness);
  });

  it("a failed set says so, shows no combos, and waits for Retry instead of asking again", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = hook({ ids: [A, B] });
    await flush();
    expect(result.current.state).toBe("failed");
    expect(result.current.combos).toBeNull();
    await flush(FACTS_DEBOUNCE_MS * 10);
    expect(urls()).toHaveLength(1);
    act(() => result.current.retry());
    expect(result.current.state).toBe("checking");
    await flush(FACTS_DEBOUNCE_MS);
    expect(urls()).toHaveLength(2);
    expect(result.current.state).toBe("ready");
  });

  it("a 429 or a malformed answer is a failure too", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    const first = hook({ ids: [A] });
    await flush();
    expect(first.result.current.state).toBe("failed");
    first.unmount();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const second = hook({ ids: [B] });
    await flush();
    expect(second.result.current.state).toBe("failed");
  });

  it("more than 200 distinct cards asks nothing — the read says it couldn't check combos", async () => {
    const many = Array.from(
      { length: 201 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const { result } = hook({ ids: many });
    await flush(FACTS_DEBOUNCE_MS * 2);
    expect(result.current.state).toBe("over");
    expect(result.current.combos).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
