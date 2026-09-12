/**
 * Reduced-motion probe for the JavaScript half of the motion policy
 * (REDESIGN.md §1): CSS motion is `motion-safe:` and the globals backstop
 * covers the rest, but a stagger written as an inline `animation-delay`
 * or a count-up driven by timers has to ask. Read at the moment the motion
 * would start (never during render), SSR-safe (no window → no motion is
 * assumed reduced: the server never animates anyway).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
