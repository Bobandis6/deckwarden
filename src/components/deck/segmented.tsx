"use client";

/**
 * Compact segmented toggle (extracted from DeckListPane in P1.7 — the share
 * page's view controls use the same widget), plus the canonical option lists
 * for the deck-view toggles shared by editor and share pages.
 *
 * R3 (F11): reimplemented over the ToggleGroup primitive — one value at a
 * time (roving focus, `aria-pressed` per item) inside a `role="group"` named
 * by the label — with an active background that slides between equal-width
 * segments (`motion-safe:` only; two CSS variables, nothing measured). The
 * `label / options / value / onChange` contract is unchanged, so neither
 * call site moved. Deselecting the pressed item is ignored: a view always
 * has a value. `touch` (R4, the editor) grows the items to 44 px on coarse
 * pointers; the share page passes nothing.
 */
import type { CSSProperties } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { GroupKey, SortKey } from "@/lib/decks/view-model";
import type { DeckViewMode } from "@/lib/decks/view-prefs";
import { cn } from "@/lib/utils";

export const VIEW_OPTIONS: { value: DeckViewMode; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "grid", label: "Grid" },
];
export const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: "primaryType", label: "Type" },
  { value: "costValue", label: "Cost" },
  { value: "tags", label: "Tags" },
];
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "cost", label: "Cost" },
  { value: "price", label: "Price" },
];

/** A labeled single-value toggle group with a sliding active background. */
export function Segmented<T extends string>({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  touch = false,
}: {
  label: string;
  /** The group's accessible name when the visible label is too terse for it (R5a: "Index view"). */
  ariaLabel?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** 44 px items on coarse pointers (the editor). */
  touch?: boolean;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <ToggleGroup
        aria-label={ariaLabel ?? label}
        value={[value]}
        onValueChange={(next: unknown[]) => {
          const picked = next[0];
          if (typeof picked === "string" && picked !== value) onChange(picked as T);
        }}
        spacing={0}
        style={
          {
            gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
            "--seg-index": index,
            "--seg-count": options.length,
          } as CSSProperties
        }
        className="border-input relative isolate grid w-fit overflow-hidden rounded-md border"
      >
        <span
          aria-hidden
          data-slot="segmented-thumb"
          className="bg-accent pointer-events-none absolute inset-y-0 left-0 -z-10 w-[calc(100%/var(--seg-count))] translate-x-[calc(var(--seg-index)*100%)] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
        />
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            size="sm"
            className={cn(
              "text-muted-foreground hover:text-foreground h-auto min-w-0 rounded-none px-2 py-0.5 text-xs font-normal hover:bg-transparent aria-pressed:bg-transparent aria-pressed:text-accent-foreground data-[state=on]:bg-transparent",
              touch && "pointer-coarse:min-h-11 pointer-coarse:px-3",
            )}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
