"use client";

/**
 * Count-up for the deck total (R3, F10): after an import the number rolls
 * to its new value over ~400 ms; a ±1 edit — anything within `threshold` —
 * jumps, and so does everything when the reader asked for reduced motion.
 * The displayed number always lands on the exact value.
 *
 * The jump path is the React "previous render" pattern (state adjusted
 * during render, no effect); only the animated path runs a timer, and its
 * setState calls happen in the interval callback. Date.now() (not
 * requestAnimationFrame) keeps it testable under fake timers.
 */
import { useEffect, useState } from "react";

export interface CountUpOptions {
  /** Deltas at or under this jump instantly. */
  threshold?: number;
  durationMs?: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useCountUp(
  value: number,
  { threshold = 5, durationMs = 400 }: CountUpOptions = {},
) {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState(value);
  const [run, setRun] = useState<{ from: number; to: number } | null>(null);

  if (prev !== value) {
    setPrev(value);
    if (Math.abs(value - prev) <= threshold || prefersReducedMotion()) {
      setShown(value);
      setRun(null);
    } else {
      setRun({ from: shown, to: value });
    }
  }

  useEffect(() => {
    if (!run) return;
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min((Date.now() - start) / durationMs, 1);
      const eased = 1 - (1 - t) ** 3;
      setShown(t >= 1 ? run.to : Math.round(run.from + (run.to - run.from) * eased));
      if (t >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [run, durationMs]);

  return shown;
}
