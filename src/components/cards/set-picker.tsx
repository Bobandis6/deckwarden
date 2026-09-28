"use client";

/**
 * SetPicker (X4a, WAVE3.md D4 as amended by the owner's answers of
 * 2026-09-28): the /cards Set group's box. Type a set's name or code and
 * pick it; the grid re-runs at once, scoped to that set. Built on X2's
 * `ui/autocomplete.tsx`, filtering the released-set list locally — the list
 * comes from GET /api/sets, fetched by the owning CardSearch the first time
 * this box asks for it (`onWantSets`) or at mount when `?set=` arrived.
 *
 * D4 drew a "[ Any set ▾ ]" button with the text box inside its popup; this
 * is a text box with the ▾ drawn in it instead — the owner types the set's
 * name here (2026-09-28), the Name box beside it is a text box too, and the
 * box stays one tab stop. What the box shows: the chosen set's name, or
 * while the reader edits, what they typed (`draft`); leaving the box, a
 * press outside the list, or a pick puts the chosen set's name back (Esc
 * and a bare Enter keep the text) — the scope changes only by a pick, the
 * chip's ×, or Clear all.
 *
 * D0's popup rules, as a picker over 706 sets rather than a server query:
 * - It opens on a click or tap, on typing, or on ↓ — at zero characters
 *   too: the list is local, so there is no request to spare (D0's
 *   two-character rule exists for the suggest endpoint).
 * - The matches show grouped "Main sets" then "Other products", best match
 *   first (`matchSets`: the exact code, then name starts, word starts, code
 *   starts, name contains; newest first inside each), at most 50 per group
 *   with a "keep typing" line under them when more matched — measured in
 *   dev, all 706 rows took ~210 ms to open, and one typed letter still
 *   matches ~500 sets. The popup is ~8 rows tall and scrolls — D0's "at
 *   most 8 rows" as a height; with nothing typed it opens on the newest.
 * - As wide as the box, never under 18 rem; rows 44 px on coarse pointers
 *   (the primitive).
 * - Nothing matched: "No matches". The list still loading: "Loading sets…".
 *   A failed fetch: one quiet line, and the next open retries.
 * - ↓ ↑ move, Enter picks the highlighted row, Enter with none highlighted
 *   does nothing (there is no form), Esc closes and keeps the text. Hover
 *   highlights nothing (`highlightItemOnHover` off), so a resting pointer
 *   never arms Enter.
 * - A `role="status"` line, mounted outside the popup, announces the count.
 *
 * `mode="none"`: the rows passed in are already matched and ordered here.
 */
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteStatus,
} from "@/components/ui/autocomplete";
import {
  matchSets,
  SET_GROUP_LABEL,
  setPlaceShort,
  type ReleasedSet,
  type SetGroup,
} from "@/lib/sets/lines";
import { cn } from "@/lib/utils";

/** Rows shown per group; typing narrows to the rest (the ranking puts the best first). */
export const SET_ROWS_PER_GROUP = 50;

interface SetGroupRows {
  value: SetGroup;
  items: ReleasedSet[];
}

/**
 * The matched rows in their two groups, each capped; an empty group is left
 * out. `matched` counts every match, shown or not.
 */
export function groupSetRows(
  sets: readonly ReleasedSet[],
  query: string,
): { groups: SetGroupRows[]; matched: number } {
  const matched = matchSets(sets, query);
  const groups = (["main", "other"] as const)
    .map((group) => ({
      value: group,
      items: matched.filter((set) => set.group === group).slice(0, SET_ROWS_PER_GROUP),
    }))
    .filter((group) => group.items.length > 0);
  return { groups, matched: matched.length };
}

export interface SetPickerProps {
  /** The released sets; null until the first fetch lands. */
  sets: ReleasedSet[] | null;
  /** The last fetch failed (the next open retries). */
  failed: boolean;
  /** The set the grid is scoped to, when the list knows it. */
  chosen: ReleasedSet | null;
  /** The box opened: the owner fetches the list if it has not (or retries a failure). */
  onWantSets: () => void;
  onPick: (set: ReleasedSet) => void;
  /** The input's look (the /cards field class). */
  inputClassName?: string;
}

export function SetPicker({
  sets,
  failed,
  chosen,
  onWantSets,
  onPick,
  inputClassName,
}: SetPickerProps) {
  /** What the reader typed since the last pick; null = the box shows the chosen set. */
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { groups, matched } = useMemo(() => groupSetRows(sets ?? [], draft ?? ""), [sets, draft]);
  const shown = groups.reduce((n, group) => n + group.items.length, 0);

  const status = !open
    ? ""
    : sets === null
      ? failed
        ? "Couldn't load the sets"
        : "Loading sets…"
      : matched
        ? `${matched.toLocaleString()} set${matched === 1 ? "" : "s"}`
        : "No matches";

  return (
    <Autocomplete
      items={groups}
      mode="none"
      value={draft ?? chosen?.name ?? ""}
      onValueChange={(next, details) => {
        // A pick fills the box through `chosen`, not through the typed text.
        if (details.reason !== "item-press") setDraft(next);
      }}
      open={open}
      onOpenChange={(next, details) => {
        setOpen(next);
        if (next) onWantSets();
        // Esc and Enter-with-nothing-highlighted keep the text (D0: the box
        // does what it did before — here, nothing); a press outside or a
        // pick shows the chosen set again (so does leaving the box).
        else if (details.reason !== "escape-key" && details.reason !== "none") setDraft(null);
      }}
      openOnInputClick
      highlightItemOnHover={false}
      itemToStringValue={(set: ReleasedSet) => set.name}
    >
      <div className="relative w-full">
        <AutocompleteInput
          aria-label="Set"
          placeholder="Any set"
          onBlur={() => setDraft(null)}
          unstyled={inputClassName !== undefined}
          className={cn(inputClassName, "pr-8")}
        />
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
        />
      </div>
      <AutocompleteStatus>{status}</AutocompleteStatus>
      <AutocompleteContent
        data-slot="set-picker-popup"
        className="max-h-[min(20rem,var(--available-height))]"
      >
        {sets === null && (
          <p className="text-muted-foreground px-1.5 py-1 text-sm">
            {failed ? "Couldn't load the sets." : "Loading sets…"}
          </p>
        )}
        {sets !== null && <AutocompleteEmpty>No matches</AutocompleteEmpty>}
        <AutocompleteList>
          {(group: SetGroupRows) => (
            <AutocompleteGroup key={group.value} items={group.items}>
              <AutocompleteGroupLabel>{SET_GROUP_LABEL[group.value]}</AutocompleteGroupLabel>
              <AutocompleteCollection>
                {(set: ReleasedSet) => (
                  <AutocompleteItem
                    key={set.code}
                    value={set}
                    onClick={() => onPick(set)}
                    className="items-start"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{set.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {set.releasedAt.slice(0, 4)} · {setPlaceShort(set)}
                      </span>
                    </span>
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 pt-0.5 font-mono text-xs uppercase">
                      {set.code === chosen?.code && <CheckIcon aria-hidden className="size-3.5" />}
                      {set.code}
                    </span>
                  </AutocompleteItem>
                )}
              </AutocompleteCollection>
            </AutocompleteGroup>
          )}
        </AutocompleteList>
        {shown < matched && (
          <p className="text-muted-foreground border-t px-1.5 pt-1.5 pb-1 text-xs">
            Showing {shown} of {matched.toLocaleString()} — keep typing to narrow.
          </p>
        )}
      </AutocompleteContent>
    </Autocomplete>
  );
}
