/**
 * ButtonGroup (U10b, WAVE5.md D10; the owner's F18): a hand copy of the v4
 * registry's `apps/v4/registry/bases/base/ui/button-group.tsx` at `c257f68`
 * (2026-09-04) — its `role="group"` root, `data-slot` and
 * `data-orientation`, and a `ButtonGroupText` over Base UI's `useRender` —
 * with the class strings of `new-york-v4/ui/button-group.tsx` at the same
 * commit, because the base registry's `cn-*` classes resolve only in its own
 * stylesheet. Never `shadcn add`: tailwind-merge order fixed, the house rules
 * applied on arrival.
 *
 * The group owns the joined shape (D1: the per-size `in-data-[slot=button-group]`
 * radius classes left the Button in U1; the group brings its own): the first
 * child keeps its leading corners, the last its trailing ones, every inner
 * corner is square, and a child after the first drops its leading border, so
 * the radius lands on the group's outer corners only. A focused child rises
 * over its neighbours so its ring is never cut.
 *
 * Deviations from the registry, on arrival:
 * - `ButtonGroupText` carries no plate (the registry's `border bg-muted px-4
 *   shadow-xs`): the house's one group is the row stepper, ghost buttons
 *   around a count on every editor row, where a plated count would put a box
 *   back on each row (D4, lines to space) and `shadow-xs` is gone house-wide
 *   (U10a). It is the count's type instead: 14 px medium, tabular, centred.
 *   A caller's `data-slot` wins over the text's own (Base UI's state
 *   attributes give way to props), so the stepper's count stays `qty`.
 * - No `ButtonGroupSeparator` (no group here divides its parts) and no
 *   Radix hidden-select rule (the house Select is Base UI's, which renders
 *   an `<input>`, not a `<select>`).
 */
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonGroupVariants = cva(
  "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

function ButtonGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

function ButtonGroupText({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex items-center justify-center gap-2 text-sm font-medium tabular-nums [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "button-group-text",
    },
  });
}

export { ButtonGroup, ButtonGroupText, buttonGroupVariants };
