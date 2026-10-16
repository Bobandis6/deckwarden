/**
 * Spinner (U10a, WAVE5.md D10; the owner's F18): a hand copy of the v4
 * registry's `apps/v4/registry/bases/base/ui/spinner.tsx` at `c257f68`
 * (2026-09-04) with `new-york-v4/ui/spinner.tsx`'s icon (the registry's
 * icon placeholder resolved to lucide's Loader2Icon), never `shadcn add`.
 *
 * D10: only inside a busy button (`aria-busy`). The motion (D0, U2): one
 * CSS rotation, `animate-spin`, linear by nature — a spinner turns at a
 * constant rate, and an eased turn stutters, so it is the documented
 * exception to the four settle and flick curves; its reduced-motion form
 * is the icon at rest (`motion-reduce:animate-none`), the button's label
 * still saying what it waits for. Inside a button whose label already says
 * "Loading…" the caller passes `aria-hidden` and no `role`, so a screen
 * reader hears the label once.
 */
import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Spinner };
