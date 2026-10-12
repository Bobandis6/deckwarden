import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// U1 (WAVE5.md D1): the design lab's "quiet rows" recipe with its "refined"
// states. The base names its transition list (Tailwind v4 moves the press
// through `translate` and `scale`, so a list naming `transform` alone never
// animates it) at 120 ms; numbers are tabular; `aria-busy` shows a progress
// cursor; `aria-disabled` is the disabled-with-reason path (see Button).
// U2 (WAVE5.md D2, F10): the press is a scale — 0.98, or 0.96 on the 24 px
// sizes — on the settle-120 curve, `motion-safe:` only, with each variant's
// hover color held on `:active` (the channel a touch press gets, where hover
// never fires, and all that reduced motion keeps). Menu triggers press too.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium tabular-nums whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,translate,scale] duration-[120ms] ease-settle-120 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-busy:cursor-progress aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The gold hairline is STRUCTURAL (W1, WAVE2.md D0): the green fill
        // is 1.84:1 on the dark page, so the border is what makes the
        // control visible (WCAG 1.4.11). It sits after the base classes so
        // tailwind-merge beats border-transparent; focus-visible:border-ring
        // still wins on focus. Hover uses the house color-mix idiom (the
        // secondary variant's) because bg-primary/80 would fade the dark
        // green INTO the dark page; mixing 12% foreground lightens on dark
        // and darkens on light. Hover and an open menu also brighten the
        // hairline; every variant holds its hover look while expanded.
        default:
          "bg-primary text-primary-foreground border-gold/70 hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)] aria-expanded:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)] active:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)] hover:border-gold/90 aria-expanded:border-gold/90 active:border-gold/90",
        // A bare line on the control edge token (globals.css), with no
        // plate of its own: ≥ 3:1 on the page and on a card in both themes
        // where the old border-border / dark:border-input line measured
        // 1.27–1.48:1, and a hovered row's tint shows through it.
        outline:
          "border-(--border-control) bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted active:bg-muted dark:hover:bg-muted/60 dark:aria-expanded:bg-muted/60 dark:active:bg-muted/60",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:text-secondary-foreground",
        // Rests in muted ink and comes forward on hover, so a dense row of
        // icon buttons reads as one quiet weight.
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground active:bg-muted active:text-foreground dark:hover:bg-muted/50 dark:aria-expanded:bg-muted/50 dark:active:bg-muted/50",
        // The hover tint is one step down from shadcn's, the first that
        // keeps the label at 4.5:1 on the page and on a card (F16; U1
        // measured 4.63 / 4.97:1 at /15 on ivory and 5.05 / 4.53:1 at /20
        // on charcoal, where /20 and /30 had measured 4.25 and 4.18:1). The
        // dark rest tint stepped from /20 to /15 with it, so hover stays the
        // heavier state.
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/15 aria-expanded:bg-destructive/15 active:bg-destructive/15 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/15 dark:hover:bg-destructive/20 dark:aria-expanded:bg-destructive/20 dark:active:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "text-brand underline-offset-4 hover:underline aria-expanded:underline active:underline",
      },
      // Touch targets (R6, REDESIGN.md §7): ONE base rule — every text size
      // grows to at least 44 × 44 px and every icon size to 44 × 44 on a
      // coarse pointer (`pointer-coarse:`), so the dialogs, forms, panels and
      // share-page actions the audit cannot open one by one are covered
      // alike; the mouse density (`h-8` / `h-7` / `h-6`) is byte-identical.
      // U1: the small sizes and every icon size share one 9.6 px radius
      // (`rounded-md`), so steppers read as one family of squares; `sm`
      // labels are 13 px, a real step between 12 and 14.
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        xs: "h-6 gap-1 rounded-md px-2 text-xs motion-safe:active:scale-[0.96] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8125rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        lg: "h-9 gap-2 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        icon: "size-8 rounded-md pointer-coarse:size-11",
        "icon-xs":
          "size-6 rounded-md motion-safe:active:scale-[0.96] [&_svg:not([class*='size-'])]:size-3 pointer-coarse:size-11",
        "icon-sm":
          "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5 pointer-coarse:size-11",
        "icon-lg": "size-9 rounded-md pointer-coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * Disabled with a reason (U1, WAVE5.md D1; WAVE2.md D0 "Disabled = visible,
 * with the reason in title/hint"): a disabled Button that carries a `title`
 * stays focusable and hoverable — Base UI's `focusableWhenDisabled` puts
 * `aria-disabled="true"` on it instead of the native attribute, so the
 * `title` can show — and still ignores clicks and keys. A disabled Button
 * with no `title` keeps native `disabled` (and `pointer-events-none`). On a
 * coarse pointer the call site also says the reason as text beside the
 * control: there is no hover on a phone.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  disabled,
  title,
  focusableWhenDisabled,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled}
      title={title}
      focusableWhenDisabled={focusableWhenDisabled ?? Boolean(disabled && title)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
