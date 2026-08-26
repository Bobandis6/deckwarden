"use client";

/**
 * Compact segmented toggle (extracted from DeckListPane in P1.7 — the share
 * page's view controls use the same widget), plus the canonical option lists
 * for the deck-view toggles shared by editor and share pages.
 */
import type { GroupKey, SortKey } from "@/lib/decks/view-model";
import type { DeckViewMode } from "@/lib/decks/view-prefs";

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

/** A labeled group of aria-pressed buttons. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="border-input flex overflow-hidden rounded-md border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`px-2 py-0.5 text-xs transition-colors ${
              option.value === value
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
