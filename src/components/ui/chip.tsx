/**
 * Chip (U10b, WAVE5.md D10; the owner's F18): the one chip, in two shapes —
 * `filter` (`rounded-md`, the 9.6 px of the small controls: the color filters
 * and their "All", the game switch, the year strips, the applied filters on
 * /cards, the hub's card links) and `tag` (`rounded-full`: the card pane's
 * tags and their presets, the Games dialog's opponents). Never a third
 * shape. The v4 registry at `c257f68` has no Chip, so this is written here,
 * over Base UI's `useRender` the way the registry's own `bases/base/ui/badge.tsx`
 * is (a span by default; a `render` element makes it a button, a Link or an
 * in-page anchor, and Base UI's state attributes give it `data-slot="chip"`
 * and `data-shape`). A caller's `data-slot` wins (the opponents' chips keep
 * theirs). No "use client": the index pages render their chips on the server.
 *
 * A chip is a control or a removable token, never a label: a status line
 * like "in combo" or a confidence word is a Badge (`ui/badge.tsx`).
 *
 * The house rules, on arrival:
 * - The edge token (U1's `--border-control`) on every chip that draws a
 *   line: ≥ 3:1 on the page and on a card where the old `border` measured
 *   1.28 to 1.47:1. A `muted` chip (an applied tag, filter or opponent) is a
 *   fill with no line, as before.
 * - One height: 24 px, 44 on a coarse pointer (R6). `default` is the pages'
 *   14 px label, `sm` the editor's and the applied filters' 12 px.
 * - The press (U2, D2: "the filter chips take the same press"; LATER row
 *   219): a button or a link scales to 0.98 on the settle-120 curve,
 *   `motion-safe:` only, with its hover color held on `:active`; reduced
 *   motion keeps the color alone. A span (a static tag, the current game)
 *   neither tints nor presses: the hover and the press are scoped to
 *   `a` and `button`.
 * - Pressed (`pressed`: an active filter, the current game) is the R5a look
 *   for every chip: the muted fill, medium weight and a 2 px ring in the
 *   game accent; keyboard focus is an outline in the same accent, offset, so
 *   the two never fight over the ring. The site sets the ARIA (`aria-pressed`
 *   on a toggle, `aria-current="page"` on a link).
 * - `aria-disabled` (One Piece "(soon)") draws the dashed edge in muted ink.
 */
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex h-6 shrink-0 items-center border border-(--border-control) bg-clip-padding whitespace-nowrap outline-none transition-[color,background-color,border-color,box-shadow,transform,translate,scale] duration-[120ms] ease-settle-120 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-game aria-disabled:border-dashed aria-disabled:text-muted-foreground has-data-[slot=chip-remove]:pr-1 pointer-coarse:min-h-11 pointer-coarse:px-3 pointer-coarse:has-data-[slot=chip-remove]:pr-0 [&:is(a,button)]:hover:bg-muted [&:is(a,button)]:active:bg-muted [&:is(a,button)]:motion-safe:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      shape: {
        filter: "rounded-md",
        tag: "rounded-full",
      },
      size: {
        default: "gap-1.5 px-2 text-sm",
        sm: "gap-1 px-2 text-xs",
      },
      variant: {
        outline: "bg-transparent",
        muted:
          "border-transparent bg-muted [&:is(a,button)]:hover:bg-muted/70 [&:is(a,button)]:active:bg-muted/70",
      },
      pressed: {
        true: "bg-muted font-medium ring-2 ring-accent-game",
        false: "",
      },
    },
    defaultVariants: {
      shape: "filter",
      size: "default",
      variant: "outline",
      pressed: false,
    },
  },
);

type ChipProps = useRender.ComponentProps<"span"> &
  Omit<VariantProps<typeof chipVariants>, "pressed"> & { pressed?: boolean };

function Chip({
  className,
  shape = "filter",
  size = "default",
  variant = "outline",
  pressed = false,
  render,
  ...props
}: ChipProps) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(chipVariants({ shape, size, variant, pressed }), className) },
      props,
    ),
    render,
    state: {
      slot: "chip",
      shape,
    },
  });
}

/**
 * A tag's ×: 16 px on a mouse, the full 44 px height of its chip on touch
 * (the chip drops its trailing padding for it), the icon-xs press. The site
 * names it ("Remove tag ramp").
 */
function ChipRemove({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="chip-remove"
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-4 shrink-0 items-center justify-center rounded-full outline-none transition-[color,scale] duration-[120ms] ease-settle-120 focus-visible:ring-2 motion-safe:active:scale-[0.96] pointer-coarse:size-11",
        className,
      )}
      {...props}
    >
      <XIcon aria-hidden className="size-3" />
    </button>
  );
}

export { Chip, ChipRemove, chipVariants };
