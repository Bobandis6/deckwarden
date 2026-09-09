"use client";

/**
 * Shared modal shell (extracted from import-export.tsx in P1.7; R1a made it
 * a thin wrapper over the installed Dialog primitive). The
 * `label / onClose / wide / children` contract is unchanged, so the six
 * call sites did not move: callers mount it conditionally and treat
 * `onClose` as the only way out — return early from it (the delete
 * dialogs do while a request is in flight) and the dialog stays open.
 *
 * Base UI supplies what the hand-rolled version never had: a focus trap,
 * focus restore to the opener on close, Escape and backdrop-press dismiss
 * routed through onOpenChange, and the labelled `role="dialog"`.
 */
import { createContext, useContext, type RefObject } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Where focus goes when a Modal closes (R3). Base UI returns it to whatever
 * was focused on open — for the editor's More menu that is a menu item that
 * has since unmounted, so the editor provides its More trigger here while a
 * menu-opened dialog is up. Undefined keeps Base UI's default (the `?` sheet
 * returns focus to wherever `?` was pressed).
 */
export const ModalFinalFocus = createContext<RefObject<HTMLElement | null> | undefined>(undefined);

export function Modal({
  label,
  onClose,
  wide = false,
  children,
}: {
  label: string;
  onClose: () => void;
  /** List-heavy dialogs (P3.6 history/diff) get a wider panel. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const finalFocus = useContext(ModalFinalFocus);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        finalFocus={finalFocus}
        className={cn(
          "flex max-h-[85dvh] flex-col gap-3 overflow-y-auto text-base",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{label}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
