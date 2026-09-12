/**
 * The leader hub's instant loading shell (R6, C9) — the same shell as /c/
 * under the One Piece accent. Segment file, not a route.
 */
import { SurfaceSkeleton } from "@/components/surface-skeleton";

export default function Loading() {
  return <SurfaceSkeleton kind="hub" game="optcg" />;
}
