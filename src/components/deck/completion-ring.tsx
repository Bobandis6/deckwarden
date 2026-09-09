"use client";

/**
 * Completion ring (R3, F2): a Base UI Meter around the deck count, drawn as
 * an SVG arc in the game accent. Closes with a one-shot glow at exactly the
 * maximum (`motion-safe:` — the keyframe lives in globals.css), turns
 * destructive over it beside the deck pane's "Over by N — rank cuts" action,
 * and renders nothing when the format has no maximum (no format has today;
 * the branch stays). Meter.Root carries `role="meter"`, `aria-valuenow`
 * (clamped to the range) and the "N of M cards" value text.
 */
import { Meter as MeterPrimitive } from "@base-ui/react/meter";

import { cn } from "@/lib/utils";

const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CompletionRing({
  value,
  max,
  className,
}: {
  value: number;
  max: number | null;
  className?: string;
}) {
  if (max === null) return null;
  const over = value > max;
  const full = value === max;
  const fraction = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <MeterPrimitive.Root
      value={value}
      min={0}
      max={max}
      getAriaValueText={() => `${value} of ${max} cards`}
      aria-label="Deck completion"
      data-slot="completion-ring"
      data-full={full || undefined}
      data-over={over || undefined}
      className={cn(
        "relative inline-flex size-8 shrink-0",
        full && "motion-safe:animate-ring-glow",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" aria-hidden className="size-8 -rotate-90">
        <circle cx="16" cy="16" r={RADIUS} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="16"
          cy="16"
          r={RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          data-slot="completion-ring-arc"
          className={cn(
            "motion-safe:transition-[stroke-dashoffset,stroke] motion-safe:duration-250",
            over ? "stroke-destructive" : "stroke-accent-game",
          )}
        />
      </svg>
    </MeterPrimitive.Root>
  );
}
