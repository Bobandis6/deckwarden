/**
 * The card page's instant loading shell (R6, C9): the card-page band height
 * with the hero box. The game is unknown here (no params reach a loading
 * file), so the band takes the brand accent until the page arrives — a
 * color change, never a shift. Segment file, not a route.
 */
import { SurfaceSkeleton } from "@/components/surface-skeleton";

export default function Loading() {
  return <SurfaceSkeleton kind="card" />;
}
