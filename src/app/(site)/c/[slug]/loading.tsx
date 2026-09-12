/**
 * The commander hub's instant loading shell (R6, C9): the shared
 * SurfaceSkeleton at the hub's band height with the hero-card box. A
 * segment file, not a route — the route table is unchanged and ISR is
 * untouched (an ISR HIT never shows it; a client navigation does).
 */
import { SurfaceSkeleton } from "@/components/surface-skeleton";

export default function Loading() {
  return <SurfaceSkeleton kind="hub" game="mtg" />;
}
