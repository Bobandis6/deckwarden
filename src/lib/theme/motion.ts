/**
 * Reduced-motion probe for the JavaScript half of the motion policy
 * (REDESIGN.md §1): CSS motion is `motion-safe:` and the globals backstop
 * covers the rest, but a stagger written as an inline `animation-delay`
 * or a roll decided when a number changes (rolling-numbers.tsx) has to
 * ask. Read at the moment the motion would start (never during the first
 * render), SSR-safe (no window → no motion is assumed reduced: the server
 * never animates anyway).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
