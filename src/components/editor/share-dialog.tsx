"use client";

/**
 * Share dialog (P1.7): the owner-facing visibility control + share link,
 * opened from the editor header. Visibility PATCHes through the token-authed
 * API via the callback the editor provides; the share URL is the /d/[publicId]
 * page. Y1: every line says what is true today — public decks already show
 * on home, their commander's page and the owner's profile; a private
 * account deck is readable by its owner wherever they sign in, a private
 * guest deck only by the browser holding its key (src/lib/decks/access.ts).
 * Copy link confirms in a status slot (the share page's F12 pattern).
 */
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type DeckVisibility = "public" | "unlisted" | "private";

/** How long the copy confirmation stays (the share page's COPY_RESET_MS). */
const COPY_RESET_MS = 1800;

type CopyState = "idle" | "copied" | "failed";

export function visibilityOptions(
  accountDeck: boolean,
): { value: DeckVisibility; label: string; hint: string }[] {
  return [
    {
      value: "public",
      label: "Public",
      hint: "Anyone with the link can view. Public decks also appear on the home page, their commander's page and your profile.",
    },
    { value: "unlisted", label: "Unlisted", hint: "Anyone with the link can view." },
    {
      value: "private",
      label: "Private",
      hint: accountDeck ? "Only you can view it." : "Only this browser can view it.",
    },
  ];
}

interface ShareDialogProps {
  publicId: string;
  visibility: DeckVisibility;
  /** An account deck (owned through the session, no claim token here): private means "only you". */
  accountDeck: boolean;
  /** PATCHes the deck; resolves on success, throws on failure. */
  onSetVisibility: (visibility: DeckVisibility) => Promise<void>;
  onClose: () => void;
}

export function ShareDialog({
  publicId,
  visibility,
  accountDeck,
  onSetVisibility,
  onClose,
}: ShareDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A nonce so a second copy replays the check and restarts the reset timer.
  const [copy, setCopy] = useState<{ state: CopyState; nonce: number }>({
    state: "idle",
    nonce: 0,
  });
  useEffect(() => {
    if (copy.state === "idle") return;
    const timer = setTimeout(
      () => setCopy((current) => ({ state: "idle", nonce: current.nonce })),
      COPY_RESET_MS,
    );
    return () => clearTimeout(timer);
  }, [copy]);

  const copyLink = () => {
    const settle = (state: CopyState) =>
      setCopy((current) => ({ state, nonce: current.nonce + 1 }));
    try {
      navigator.clipboard.writeText(shareUrl).then(
        () => settle("copied"),
        () => settle("failed"),
      );
    } catch {
      settle("failed");
    }
  };

  const shareUrl =
    typeof window === "undefined" ? `/d/${publicId}` : `${window.location.origin}/d/${publicId}`;

  const setVisibility = async (value: DeckVisibility) => {
    if (busy || value === visibility) return;
    setBusy(true);
    setError(null);
    try {
      await onSetVisibility(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Share deck" onClose={onClose}>
      <fieldset disabled={busy}>
        <legend className="text-muted-foreground text-xs">Who can see this deck</legend>
        <div className="mt-1.5 space-y-1.5">
          {visibilityOptions(accountDeck).map((option) => (
            <label
              key={option.value}
              className="hover:bg-muted/60 flex cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1"
            >
              <input
                type="radio"
                name="deck-visibility"
                value={option.value}
                checked={visibility === option.value}
                onChange={() => void setVisibility(option.value)}
                className="translate-y-px"
              />
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-muted-foreground text-xs">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p aria-live="polite" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          readOnly
          value={shareUrl}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="border-input min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 font-mono text-xs outline-none"
        />
        <Button size="sm" onClick={copyLink}>
          Copy link
        </Button>
      </div>
      <span role="status" data-slot="copy-status" className="-mt-2 min-h-4 text-xs">
        {copy.state === "copied" && (
          <span
            key={copy.nonce}
            className="inline-flex items-center gap-1 text-emerald-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-200 dark:text-emerald-400"
          >
            <CheckIcon aria-hidden className="size-3.5" />
            Link copied
          </span>
        )}
        {copy.state === "failed" && (
          <span className="text-destructive">
            Couldn&apos;t copy — select the link and copy it.
          </span>
        )}
      </span>
      {visibility === "private" && (
        <p className="text-muted-foreground text-xs">
          The link only works for you while the deck is private.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<a href={`/d/${publicId}`} target="_blank" rel="noreferrer" />}
        >
          Open share page
        </Button>
      </div>
    </Modal>
  );
}
