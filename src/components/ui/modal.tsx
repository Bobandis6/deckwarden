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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
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
