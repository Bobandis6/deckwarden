"use client";

/**
 * Shared modal shell (extracted from import-export.tsx in P1.7): overlay +
 * panel, Escape and overlay-click close. Hand-rolled — no shadcn dialog
 * installed; focus trapped by inert siblings not needed at this scale.
 */
import { Button } from "@/components/ui/button";

export function Modal({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="bg-background flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg border p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{label}</h2>
          <Button variant="ghost" size="xs" onClick={onClose} aria-label={`Close ${label}`}>
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
