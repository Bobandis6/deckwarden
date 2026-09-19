"use client";

/**
 * ContextMenu (W3, WAVE2.md D2): the right-click counterpart to
 * ui/dropdown-menu.tsx, written by hand — `@base-ui/react/context-menu`
 * re-exports the Menu parts (Item, LinkItem, RadioGroup, Submenu*,
 * Separator…), so the existing DropdownMenu* item wrappers render inside
 * this Content unchanged; only Root, Trigger and the pointer-anchored
 * Content are context-menu-specific. The popup classes mirror
 * DropdownMenuContent minus `w-(--anchor-width)` — the anchor here is the
 * pointer, whose width is zero.
 */
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "@/lib/utils";

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

/**
 * Renders a `<div>` by default; pass `render={<DeckTile …/>}` (or any
 * element) to make that element the right-click surface itself — the way
 * /account keeps valid `ul > li` markup.
 */
function ContextMenuTrigger({ ...props }: ContextMenuPrimitive.Trigger.Props) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}

function ContextMenuContent({ className, ...props }: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="isolate z-50 outline-none">
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            "z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

export { ContextMenu, ContextMenuTrigger, ContextMenuContent };
