/**
 * The event page's instant loading shell (W10, the R6 pattern): shape, not
 * content — a title bar, a meta line, and a standings-table block at the
 * page's own container width. A segment file, not a route; an ISR HIT
 * never shows it, a client navigation paints it at once.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="max-w-wide mx-auto w-full min-h-dvh flex-1 px-4 py-8">
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="mt-2 h-5 w-56 max-w-full" />
      <Skeleton className="mt-6 h-96 w-full max-w-2xl rounded-lg" />
    </main>
  );
}
