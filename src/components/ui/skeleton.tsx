import { cn } from "@/lib/utils";

// R6 (C9): the pulse is decorative — `motion-safe:` like every other
// decorative animation in src/ (REDESIGN.md §1 motion policy). The globals
// backstop would have collapsed it anyway; this way it never exists for a
// reduced-motion reader, and the shell reads as a still shape.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}

export { Skeleton };
