"use client";

import { Meter as MeterPrimitive } from "@base-ui/react/meter";
import { cn } from "@/lib/utils";

// Hand-written over @base-ui/react/meter in the shape `shadcn add` produces
// (the base-nova registry has no meter item as of 4.19). Progress is the
// sibling; Meter is the read-only "how full" gauge — the completion ring in
// R3 reads the deck count through it.
function Meter({ className, children, value, ...props }: MeterPrimitive.Root.Props) {
  return (
    <MeterPrimitive.Root
      value={value}
      data-slot="meter"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <MeterTrack>
        <MeterIndicator />
      </MeterTrack>
    </MeterPrimitive.Root>
  );
}

function MeterTrack({ className, ...props }: MeterPrimitive.Track.Props) {
  return (
    <MeterPrimitive.Track
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className,
      )}
      data-slot="meter-track"
      {...props}
    />
  );
}

function MeterIndicator({ className, ...props }: MeterPrimitive.Indicator.Props) {
  return (
    <MeterPrimitive.Indicator
      data-slot="meter-indicator"
      className={cn("h-full bg-primary transition-all", className)}
      {...props}
    />
  );
}

function MeterLabel({ className, ...props }: MeterPrimitive.Label.Props) {
  return (
    <MeterPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="meter-label"
      {...props}
    />
  );
}

function MeterValue({ className, ...props }: MeterPrimitive.Value.Props) {
  return (
    <MeterPrimitive.Value
      className={cn("ml-auto text-sm text-muted-foreground tabular-nums", className)}
      data-slot="meter-value"
      {...props}
    />
  );
}

export { Meter, MeterTrack, MeterIndicator, MeterLabel, MeterValue };
