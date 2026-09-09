/**
 * EmptyState (R1b, C8): one shape for "nothing here yet" — the shield mark
 * (optional), a title, a hint, an optional action — so empty lists read the
 * same everywhere. Shield only (REDESIGN.md §6: no character asset), and
 * the copy stays plain here; the Warden voice is R5b/F8's. Smoke-pinned
 * strings ("No bookmarks yet", …) pass through as the title verbatim.
 */
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  /** Show the shield mark above the title (the main empty state of a surface). */
  mark?: boolean;
  className?: string;
}

export function EmptyState({ title, hint, action, mark = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm",
        className,
      )}
    >
      {mark && <BrandMark className="mb-1 size-8 opacity-80" />}
      <p className="text-foreground font-medium">{title}</p>
      {hint && <p className="text-xs">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
