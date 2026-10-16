"use client";

/**
 * Field (U10a, WAVE5.md D10; the owner's F18): a hand copy of the v4
 * registry's `apps/v4/registry/bases/base/ui/field.tsx` at `c257f68`
 * (2026-09-04) — its parts, slots and `group/field` hooks — with the class
 * strings of `new-york-v4/ui/field.tsx` at the same commit, because the
 * base registry's `cn-*` classes resolve only in its own stylesheet. Never
 * `shadcn add`: tailwind-merge order fixed, the house type ladder (U8) and
 * density applied on arrival.
 *
 * One deviation, structural: the registry's Field is plain markup (a
 * `role="group"` div, a `<label>`, a `<p>`) and leaves `for`/`id` and
 * `aria-describedby` to each call site, which is how twelve hand-rolled
 * input recipes grew. These parts render over `@base-ui/react/field`
 * instead: a `FieldLabel` is associated with the control, and every
 * `FieldDescription` and `FieldError` lands in the control's
 * `aria-describedby`, with no ids at the sites. The ids are the Field's own
 * — an explicit `id` on an Input inside a Field takes effect only after
 * hydration (measured), so the sites pass none; a label and its control
 * share the generated id in the server HTML.
 *
 * The house density, not the registry's: a vertical stack puts 4 px between
 * a 12 px muted label (the editor's and the dialogs' caption, F4) and its
 * control; a horizontal row (a Checkbox and its words) is the 14 px row the
 * sheets and /sets had, 8 px apart. `FieldDescription` is the muted 12 px
 * line D1 named for a disabled control's reason on touch and D10 for the
 * 429 sentence under a field; `FieldError` is the destructive 12 px line,
 * `role="alert"` as in the registry, rendered only with content.
 */
import { Field as FieldPrimitive } from "@base-ui/react/field";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const fieldVariants = cva("group/field flex w-full data-invalid:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col gap-1 [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center gap-2 text-sm *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:items-start",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function Field({
  className,
  orientation = "vertical",
  ...props
}: FieldPrimitive.Root.Props & VariantProps<typeof fieldVariants>) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("group/field-content flex flex-1 flex-col gap-1 leading-snug", className)}
      {...props}
    />
  );
}

/**
 * The label: 12 px muted over a control (`.type-label-xs`, the dialogs'
 * caption); beside one (a horizontal Field) it is the row's own text —
 * `font: inherit` from the Field, 14 px by default, 12 px where a pane
 * says so — in the foreground ink, muted again when its Field is disabled
 * (D1's "disabled = visible").
 */
function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label type-label-xs text-muted-foreground block w-fit select-none",
        "group-data-[orientation=horizontal]/field:text-foreground group-data-[orientation=horizontal]/field:tracking-normal group-data-[orientation=horizontal]/field:[font:inherit]",
        "group-data-disabled/field:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn(
        "type-meta text-muted-foreground font-normal group-has-[[data-orientation=horizontal]]/field:text-balance",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Renders only with content (the registry's rule), always when it does
 * (`match`): the sites own their error strings and their timing.
 */
function FieldError({ className, children, ...props }: FieldPrimitive.Error.Props) {
  if (!children) return null;
  return (
    <FieldPrimitive.Error
      match
      role="alert"
      data-slot="field-error"
      className={cn("type-meta text-destructive font-normal", className)}
      {...props}
    >
      {children}
    </FieldPrimitive.Error>
  );
}

export { Field, FieldContent, FieldLabel, FieldDescription, FieldError };
