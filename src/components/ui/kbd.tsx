import { cn } from "@/lib/utils";

/**
 * Keycap (R3, F14): a styled <kbd> for the search pane's hint line and the
 * `?` shortcut sheet (F7). Plain markup — Base UI has no kbd part — sized to
 * sit inside a 12 px line without growing it.
 */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-muted text-foreground inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-b-2 px-1 font-mono text-[0.65rem] leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}
