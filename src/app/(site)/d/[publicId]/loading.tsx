/**
 * The deck share page's instant loading shell (R6, C9): the deck band and
 * the header's title bars, no hero. /d/ is force-dynamic, so this streams
 * FIRST on every request and the deck follows in a later chunk — the
 * HTML-reading smokes keep working because every pin is a substring check.
 * Segment file, not a route.
 */
import { SurfaceSkeleton } from "@/components/surface-skeleton";

export default function Loading() {
  return <SurfaceSkeleton kind="deck" />;
}
