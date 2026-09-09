/**
 * useCountUp (R3, F10) under fake timers: small deltas jump, an import-sized
 * delta rolls through intermediate values and lands exactly, and reduced
 * motion is instant.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCountUp } from "./use-count-up";

function Probe({ value }: { value: number }) {
  const shown = useCountUp(value);
  return <span data-testid="n">{shown}</span>;
}

const read = () => Number(screen.getByTestId("n").textContent);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCountUp", () => {
  it("±1 edits jump instantly", () => {
    const { rerender } = render(<Probe value={98} />);
    rerender(<Probe value={99} />);
    expect(read()).toBe(99);
    rerender(<Probe value={94} />);
    expect(read()).toBe(94);
  });

  it("a delta above five rolls up over ~400 ms and lands exactly", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Probe value={1} />);
    rerender(<Probe value={100} />);
    expect(read()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(160);
    });
    const midway = read();
    expect(midway).toBeGreaterThan(1);
    expect(midway).toBeLessThan(100);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(read()).toBe(100);
  });

  it("reduced motion jumps even for large deltas", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { rerender } = render(<Probe value={0} />);
    rerender(<Probe value={100} />);
    expect(read()).toBe(100);
  });
});
