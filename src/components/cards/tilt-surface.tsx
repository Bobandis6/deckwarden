"use client";

/**
 * The tilt's React end (CARD-TILT, 2026-11-03): `useTiltSurface(maxDeg)` is
 * a callback ref for the element a card sits in. It turns that element's
 * first child, the card, toward a fine pointer moving over it
 * (src/lib/motion/tilt.ts) and lets go when the element leaves. The ref is
 * stable per angle, so a re-render never resets a tilt mid-hover. The
 * editor's leader button takes the hook; `TiltSurface` is the same on a
 * plain div, for the hub heroes on /c/ and /l/, which are server pages.
 */
import { useCallback, type ReactNode } from "react";

import { attachTilt } from "@/lib/motion/tilt";

export function useTiltSurface(maxDeg: number) {
  return useCallback(
    (surface: HTMLElement | null) => {
      const card = surface?.firstElementChild;
      if (!(card instanceof HTMLElement)) return;
      return attachTilt(card, { maxDeg, surface });
    },
    [maxDeg],
  );
}

export function TiltSurface({
  maxDeg,
  className,
  children,
}: {
  maxDeg: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useTiltSurface(maxDeg);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
