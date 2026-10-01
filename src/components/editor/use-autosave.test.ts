/**
 * useAutosave (P1.2): its three callbacks keep their identity across renders
 * — the editor's pagehide/unmount keepalive effect depends on `isDirty`, and
 * a fresh arrow per render re-ran that effect's cleanup (a keepalive PUT) on
 * every render while dirty (LATER row 161) — and two marks inside the delay
 * are one save, a full delay after the last.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "./use-autosave";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("markDirty, flush and isDirty survive re-renders; isDirty reads the live state", async () => {
    const save = vi.fn(async () => {});
    const { result, rerender } = renderHook(() => useAutosave(save));
    const first = result.current;
    expect(first.isDirty()).toBe(false);

    act(() => first.markDirty());
    rerender();
    expect(result.current.status).toBe("dirty");
    expect(result.current.isDirty).toBe(first.isDirty);
    expect(result.current.markDirty).toBe(first.markDirty);
    expect(result.current.flush).toBe(first.flush);
    expect(first.isDirty()).toBe(true);

    await act(async () => {
      await first.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(first.isDirty()).toBe(false);
    expect(result.current.status).toBe("saved");
  });

  it("two marks inside the delay are one save, a full delay after the last", async () => {
    const save = vi.fn(async () => {});
    const { result } = renderHook(() => useAutosave(save, 1000));
    act(() => result.current.markDirty());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => result.current.markDirty());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
  });
});
