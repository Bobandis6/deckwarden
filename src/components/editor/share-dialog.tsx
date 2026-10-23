"use client";

/**
 * Share dialog (P1.7): the owner-facing visibility control + share link,
 * opened from the editor header. Visibility PATCHes through the token-authed
 * API via the callback the editor provides; the share URL is the /d/[publicId]
 * page. Y1: every line says what is true today — public decks already show
 * on home, their commander's page and the owner's profile; a private
 * account deck is readable by its owner wherever they sign in, a private
 * guest deck only by the browser holding its key (src/lib/decks/access.ts).
 * Copy link confirms in a status slot (the share page's F12 pattern —
 * the shared useCopyToClipboard + CopyStatus since Y5).
 *
 * DECK-PREVIEW-BRACKET (DECKCHECK-STUDY §2.4): for a game with brackets, one
 * line under the link says what the deck's link preview says about the
 * bracket — "Link previews show Bracket 3 (declared)." and Change, or "Link
 * previews show no bracket." and "Declare a bracket" — in the image's own
 * words: core's `declaredLabel`, which the unfurl draws (the equality is
 * pinned in share-dialog.test.tsx), and a level the game doesn't have reads
 * as none, as it does on the image. The action is the editor's: it opens
 * the Why sheet at Your target (`bracket.onDeclare`), and closing the sheet
 * comes back here with focus on the action (`openAt: "bracket"`). No line
 * while the deck is private (its preview is the generic image; the private
 * line speaks) or without `bracket` (One Piece; a Magic list with no
 * commander, whose sheet can't open). The words describe the image the link
 * draws today, never one a chat app already fetched and keeps.
 */
import { useId, useRef, useState, type ComponentProps } from "react";

import { CopyStatus, useCopyToClipboard } from "@/components/copy-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { BRACKET_COPY, declaredLabel } from "@/lib/brackets/copy";
import type { BracketsMeta } from "@/lib/games/types";

export type DeckVisibility = "public" | "unlisted" | "private";

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

/** DECK-PREVIEW-BRACKET: what the link preview says about the bracket, and the way to declare one. */
export interface ShareBracket {
  /** The adapter's declaration: its noun says the words, its levels are the ones an image draws. */
  brackets: Pick<BracketsMeta, "noun" | "levels">;
  /** The owner's declared target (goals.targetLevel); null = previews show no bracket. */
  targetLevel: number | null;
  /** Change / Declare a bracket: the editor opens the Why sheet at Your target. */
  onDeclare: () => void;
}

interface ShareDialogProps {
  publicId: string;
  visibility: DeckVisibility;
  /** An account deck (owned through the session, no claim token here): private means "only you". */
  accountDeck: boolean;
  /** PATCHes the deck; resolves on success, throws on failure. */
  onSetVisibility: (visibility: DeckVisibility) => Promise<void>;
  /** DECK-PREVIEW-BRACKET: the link preview's bracket line; absent = none (One Piece, no commander). */
  bracket?: ShareBracket;
  /** "bracket" opens the dialog with focus on the bracket line's action (back from the Why sheet). */
  openAt?: "bracket" | null;
  /** Where focus goes on close, over the context's (back from the Why sheet: the header's Share). */
  finalFocus?: ComponentProps<typeof Modal>["finalFocus"];
  onClose: () => void;
}

export function ShareDialog({
  publicId,
  visibility,
  accountDeck,
  onSetVisibility,
  bracket,
  openAt = null,
  finalFocus,
  onClose,
}: ShareDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = useCopyToClipboard();
  const bracketId = useId();
  const bracketAction = useRef<HTMLButtonElement>(null);
  // The image's words: a target the game has is drawn as its declared label; anything else, nothing.
  const declared =
    bracket?.targetLevel != null &&
    bracket.brackets.levels.some((l) => l.level === bracket.targetLevel)
      ? declaredLabel(bracket.brackets, bracket.targetLevel)
      : null;

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
    <Modal
      label="Share deck"
      onClose={onClose}
      initialFocus={openAt === "bracket" ? bracketAction : undefined}
      finalFocus={finalFocus}
    >
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
        <Input
          readOnly
          value={shareUrl}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 font-mono"
        />
        <Button size="sm" onClick={() => copy.copy(shareUrl)}>
          Copy link
        </Button>
      </div>
      <CopyStatus
        copy={copy}
        copied="Link copied"
        failed="Couldn't copy. Select the link and copy it."
        className="-mt-2 min-h-4"
      />
      {visibility === "private" ? (
        <p className="text-muted-foreground text-xs">
          The link only works for you while the deck is private.
        </p>
      ) : (
        bracket && (
          <p data-slot="share-bracket" className="text-muted-foreground text-xs">
            <span id={bracketId}>
              {declared
                ? BRACKET_COPY.previewShows(declared)
                : BRACKET_COPY.previewShowsNone(bracket.brackets.noun)}
            </span>{" "}
            <button
              ref={bracketAction}
              type="button"
              aria-describedby={bracketId}
              onClick={bracket.onDeclare}
              className="text-foreground ml-1 cursor-pointer font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              {declared ? BRACKET_COPY.changeGoals : BRACKET_COPY.declare(bracket.brackets.noun)}
            </button>
          </p>
        )
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
