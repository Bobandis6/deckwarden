"use client";

/**
 * Checkbox (U10a, WAVE5.md D10; the owner's F18): a hand copy of the v4
 * registry's `apps/v4/registry/bases/base/ui/checkbox.tsx` at `c257f68`
 * (2026-09-04) — `@base-ui/react/checkbox`'s Root and Indicator, the slots
 * — with the class string of `new-york-v4/ui/checkbox.tsx` at the same
 * commit (its `data-[state=checked]` hooks are Base UI's `data-checked`
 * and `data-indeterminate` here), never `shadcn add`.
 *
 * On arrival: the edge token (`--border-control`, U1) draws the box in
 * every state — the registry moves the border to `primary` when checked,
 * which is 1.84:1 on the dark page (W1's reason for the buttons' gold
 * hairline), so here the fill is primary and the line stays the token —
 * no `shadow-xs`; the 44 px coarse-pointer rule as an invisible hit area
 * around the 16 px box (`after:-inset-3.5`, the registry's `after:` idea at
 * the house size); an indeterminate box shows a minus (Base UI sets the
 * hidden input's `indeterminate` itself). The root renders a native
 * `<button type="button">` (`nativeButton`) rather than the registry's
 * span, so `disabled` is the real attribute the tests and the `disabled:`
 * variants read, and the hidden `<input type="checkbox">` beside it keeps
 * the form semantics.
 */
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      nativeButton
      render={<button type="button" />}
      className={cn(
        "group/checkbox peer relative size-4 shrink-0 rounded-[4px] border border-(--border-control) bg-transparent transition-[color,background-color,border-color,box-shadow] duration-[120ms] ease-settle-120 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:bg-primary data-indeterminate:text-primary-foreground dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary dark:data-indeterminate:bg-primary pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon aria-hidden className="size-3.5 group-data-indeterminate/checkbox:hidden" />
        <MinusIcon
          aria-hidden
          className="hidden size-3.5 group-data-indeterminate/checkbox:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
