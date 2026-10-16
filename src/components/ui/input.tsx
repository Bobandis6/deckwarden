/**
 * Input: the v4 registry's `apps/v4/registry/bases/base/ui/input.tsx`
 * (`@base-ui/react/input`, a Field control that wires itself to a Field's
 * label and descriptions) with the class string of `new-york-v4/ui/input.tsx`.
 * U1 moved its edge to the control token (`--border-control`); U10a
 * (WAVE5.md D10) adds the 44 px coarse-pointer floor every other control
 * carries and makes it the one input recipe — the twelve hand-rolled
 * `<input>` boxes of the dialogs, the account forms and the search boxes
 * render through it. `ui/autocomplete.tsx` copies this class string (X2's
 * precedent) and must follow it.
 */
import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-(--border-control) bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 pointer-coarse:min-h-11",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
