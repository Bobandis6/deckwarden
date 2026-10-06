"use client";

/**
 * Copy confirmation (F12, extracted in Y5 — WAVE4 D6): one hook and one
 * status slot for every "copy" button — the share page's Copy decklist and
 * the owner's Copy menu, the Share dialog's Copy link, the Export dialog.
 *
 * `useCopyToClipboard().copy(text)` writes the text and settles "copied"
 * or "failed" (a refused write, or no clipboard API at all — an insecure
 * context — says so instead of nothing); the state clears after
 * COPY_RESET_MS. A nonce rides along, so a second copy replays the check
 * and restarts the timer. `CopyStatus` is the live slot that says it: a
 * check that plays once (keyed by the nonce, `motion-safe:` only) beside
 * the words the caller names. The button keeps its own name throughout.
 */
import { CheckIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** The confirmation clears after this (F12). */
export const COPY_RESET_MS = 1800;

export type CopyState = "idle" | "copied" | "failed";

export interface CopyResult {
  state: CopyState;
  nonce: number;
  /** Which copy settled — a menu with two copies names the one that did. */
  what: string | null;
}

export function useCopyToClipboard(): CopyResult & {
  copy: (text: string, what?: string) => void;
  /** Settle without writing — a caller that copied some other way (Share… fell back, or failed). */
  settle: (state: Exclude<CopyState, "idle">, what?: string) => void;
} {
  const [result, setResult] = useState<CopyResult>({ state: "idle", nonce: 0, what: null });
  useEffect(() => {
    if (result.state === "idle") return;
    const timer = setTimeout(
      () => setResult((current) => ({ state: "idle", nonce: current.nonce, what: null })),
      COPY_RESET_MS,
    );
    return () => clearTimeout(timer);
  }, [result]);

  const settle = useCallback(
    (state: Exclude<CopyState, "idle">, what?: string) =>
      setResult((current) => ({ state, nonce: current.nonce + 1, what: what ?? null })),
    [],
  );
  const copy = useCallback(
    (text: string, what?: string) => {
      try {
        navigator.clipboard.writeText(text).then(
          () => settle("copied", what),
          () => settle("failed", what),
        );
      } catch {
        // No clipboard API (an insecure context): say so instead of nothing.
        settle("failed", what);
      }
    },
    [settle],
  );
  return { ...result, copy, settle };
}

/** The live slot: "Copied" with a check that plays once, or the failure in words. */
export function CopyStatus({
  copy,
  copied = "Copied",
  failed = "Copy failed",
  className,
}: {
  copy: Pick<CopyResult, "state" | "nonce">;
  copied?: string;
  failed?: string;
  className?: string;
}) {
  return (
    <span role="status" data-slot="copy-status" className={cn("text-xs", className)}>
      {copy.state === "copied" && (
        <span
          key={copy.nonce}
          className="inline-flex items-center gap-1 text-emerald-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-200 dark:text-emerald-400"
        >
          <CheckIcon aria-hidden className="size-3.5" />
          {copied}
        </span>
      )}
      {copy.state === "failed" && <span className="text-destructive">{failed}</span>}
    </span>
  );
}
