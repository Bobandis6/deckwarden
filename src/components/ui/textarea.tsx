"use client";

/**
 * Textarea (U10a, WAVE5.md D10; the owner's F18): a hand copy of the v4
 * registry's `apps/v4/registry/bases/base/ui/textarea.tsx` at `c257f68`
 * (2026-09-04) with the class string of `new-york-v4/ui/textarea.tsx` at
 * the same commit, never `shadcn add`. On arrival: the edge token
 * (`--border-control`, U1) in place of `border-input`, ui/input.tsx's
 * radius, padding and dark fill so a notes field and the box above it read
 * as one family, no `shadow-xs` (the house draws edges, not shadows), and
 * the 44 px coarse-pointer floor. The registry's `field-sizing-content` is
 * left out: every site sets `rows` (a paste area invites a paste at twelve
 * lines, not four) and the notes keep `resize-y`.
 */
import * as React from "react";
import { Field as FieldPrimitive } from "@base-ui/react/field";

import { cn } from "@/lib/utils";

/**
 * Rendered through Base UI's Field.Control (what `@base-ui/react/input` is
 * underneath) so that, inside a Field, the label's `for`, the description's
 * and the error's `aria-describedby` reach the textarea as they reach an
 * Input; standalone it is a plain textarea.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <FieldPrimitive.Control
      data-slot="textarea"
      render={<textarea {...props} />}
      className={cn(
        "flex min-h-16 w-full rounded-lg border border-(--border-control) bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 pointer-coarse:min-h-11",
        className,
      )}
    />
  );
}

export { Textarea };
