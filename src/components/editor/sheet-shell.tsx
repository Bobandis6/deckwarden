"use client";

/**
 * The editor's sheet split (Y7b): a bottom Drawer on phones, a Modal from
 * md. The swap sheets and Y9a's Games dialog share it. Its own module since
 * Y9b: the share page and `/account` load the Games dialog on demand, and
 * the chunk they fetch at the table shouldn't carry the swap sheets.
 */
import { XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";

export type SheetFinalFocus = ComponentProps<typeof Modal>["finalFocus"];
export type SheetInitialFocus = ComponentProps<typeof Modal>["initialFocus"];

export function SheetShell({
  title,
  phone,
  initialFocus,
  finalFocus,
  onClose,
  children,
}: {
  title: string;
  phone: boolean;
  initialFocus?: SheetInitialFocus;
  finalFocus?: SheetFinalFocus;
  onClose: () => void;
  children: ReactNode;
}) {
  if (phone) {
    return (
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        showSwipeHandle
      >
        <DrawerContent aria-label={title} initialFocus={initialFocus} finalFocus={finalFocus}>
          <div className="flex shrink-0 items-center justify-between gap-2 pr-2 pl-4">
            <DrawerTitle className="truncate text-sm font-semibold">{title}</DrawerTitle>
            <DrawerClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  className="pointer-coarse:size-11"
                />
              }
            >
              <XIcon />
            </DrawerClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Modal label={title} onClose={onClose} initialFocus={initialFocus} finalFocus={finalFocus}>
      {children}
    </Modal>
  );
}
