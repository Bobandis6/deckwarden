"use client";

/**
 * Autocomplete (X2, WAVE3.md D0): the one new primitive of Wave 3, written by
 * hand over `@base-ui/react/autocomplete` (installed, 1.7.0) — the W3
 * `ui/context-menu.tsx` precedent, no `shadcn add`. X2's name box is its
 * first user; X4a's set picker and X5's card-art picker reuse it.
 *
 * The popup classes are DropdownMenuContent's (`ui/dropdown-menu.tsx`),
 * copied, with D0's width: as wide as the input (`--anchor-width`), never
 * narrower than 18 rem, never wider than the viewport allows. Items borrow
 * the dropdown item's look, keyed on `data-highlighted` instead of `:focus`
 * — a combobox keeps DOM focus in its input and moves a virtual highlight —
 * and grow to 44 px on coarse pointers. Hover is plain CSS: callers that
 * follow D0 ("nothing is highlighted until an arrow key is pressed") pass
 * `highlightItemOnHover={false}` to the Root, so a resting pointer never
 * arms Enter.
 *
 * Status must stay mounted to announce (Base UI's own rule), so render it
 * outside the popup; it is `sr-only` here. Empty, Group and GroupLabel are
 * D0's parts for the pickers that filter client-side (X4a's sets); X2's
 * name box renders its own "No matches" line, because its footer row keeps
 * the list from ever being empty. No Separator: a listbox owns options only.
 *
 * X4a adds Collection: Base UI renders a grouped `items` list only as
 * List → Group (with that group's `items`) → Collection → Item, so the Set
 * picker's "Main sets" / "Other products" need it.
 */
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";

import { cn } from "@/lib/utils";

const Autocomplete = AutocompletePrimitive.Root;

/**
 * The input, with ui/input.tsx's look copied verbatim (the precedent of
 * copying, not importing, a sibling's class string) so a box that was an
 * `<Input>` looks exactly as it did. `unstyled`: the caller brings the whole
 * look — /cards keeps the field class its Type and Traits controls share.
 */
function AutocompleteInput({
  className,
  unstyled = false,
  ...props
}: AutocompletePrimitive.Input.Props & { unstyled?: boolean }) {
  return (
    <AutocompletePrimitive.Input
      data-slot="autocomplete-input"
      className={
        unstyled
          ? className
          : cn(
              "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
              className,
            )
      }
      {...props}
    />
  );
}

/** Portal + Positioner + Popup, below the input by default. */
function AutocompleteContent({
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: AutocompletePrimitive.Popup.Props &
  Pick<AutocompletePrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <AutocompletePrimitive.Portal>
      <AutocompletePrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <AutocompletePrimitive.Popup
          data-slot="autocomplete-content"
          className={cn(
            "bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-72 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg p-1 shadow-md ring-1 duration-100 outline-none data-closed:overflow-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
            className,
          )}
          {...props}
        />
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  );
}

function AutocompleteList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="autocomplete-list"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

function AutocompleteItem({ className, ...props }: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        "hover:bg-accent/60 data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden select-none pointer-coarse:min-h-11 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function AutocompleteEmpty({ className, ...props }: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="autocomplete-empty"
      className={cn("text-muted-foreground px-1.5 py-1 text-sm empty:hidden", className)}
      {...props}
    />
  );
}

function AutocompleteStatus({ className, ...props }: AutocompletePrimitive.Status.Props) {
  return (
    <AutocompletePrimitive.Status
      data-slot="autocomplete-status"
      className={cn("sr-only", className)}
      {...props}
    />
  );
}

function AutocompleteGroup({ ...props }: AutocompletePrimitive.Group.Props) {
  return <AutocompletePrimitive.Group data-slot="autocomplete-group" {...props} />;
}

/** The rows of one Group, rendered from the Group's `items` (a render function child). */
const AutocompleteCollection = AutocompletePrimitive.Collection;

function AutocompleteGroupLabel({ className, ...props }: AutocompletePrimitive.GroupLabel.Props) {
  return (
    <AutocompletePrimitive.GroupLabel
      data-slot="autocomplete-group-label"
      className={cn("text-muted-foreground px-1.5 py-1 text-xs font-medium", className)}
      {...props}
    />
  );
}

export {
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
};
