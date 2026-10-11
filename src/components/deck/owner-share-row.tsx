"use client";

/**
 * The owner's action row on the share page (Y5, WAVE4 D6): Log a game (Y9b)
 * · Open in editor · Copy ▾ (Copy decklist, Copy for the table) · Share… ·
 * Buy this deck, then one status slot for all three copies. Everyone else keeps the
 * visitor row byte-identical (DeckShareView decides — the server's
 * `isOwner` for an account deck, this browser's claim token for a guest
 * deck, Y1's rule).
 *
 * - **Copy ▾** is a Base UI menu, named after its trigger ("Copy", R1b).
 *   "Copy for the table" shows only where the page has a read to tell
 *   (src/lib/brackets/table.ts' text, built when chosen).
 * - **Share…** opens the phone's share sheet (`navigator.share`,
 *   feature-detected, coarse pointers only — a desktop share sheet is a
 *   surprise where a copied link is expected); everywhere else, or when the
 *   sheet fails, it copies the link and says so in the same slot. Closing
 *   the sheet is not a failure and says nothing.
 * - **Buy this deck** stays (a deviation from D6's three: the owner is the
 *   one most likely to buy the cards).
 * - **Log a game** (Y9b, D10 — phone first: the share page is the deck at
 *   the table, so it leads the row) opens Y9b's Games dialog, loaded on
 *   demand (log-game-door.tsx — a visitor never fetches it; the chunk is
 *   preloaded once this row mounts, so the first tap opens at once). With
 *   the players remembered, Log a game → Won → the toast is the whole log.
 *   A guest owner (this browser's claim token) gets the same door, and the
 *   dialog reads "Sign in to keep a game journal" with `?next=` back to
 *   this page. Shown only where the game declares a journal.
 */
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CopyStatus, useCopyToClipboard } from "@/components/copy-status";
import { LazyLogGameDialog, preloadLogGameDialog } from "@/components/editor/log-game-door";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BRACKET_COPY } from "@/lib/brackets/copy";
import type { GameId } from "@/lib/games/types";
import { JOURNAL_COPY } from "@/lib/journal/copy";

/** What each copy says once it lands. */
const COPIED: Record<string, string> = {
  decklist: "Decklist copied",
  table: BRACKET_COPY.copiedForTable,
  link: "Link copied",
};

/** Phones: a share sheet exists and the pointer is coarse. */
export function canShareNatively(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function OwnerShareRow({
  deckId,
  publicId,
  deckName,
  decklist,
  tableText,
  buy,
  journal = null,
}: {
  deckId: string;
  publicId: string;
  deckName: string;
  /** The decklist, serialized when chosen. */
  decklist: () => string;
  /** "Copy for the table"'s text, built when chosen; null = no read to tell (no item). */
  tableText: (() => string) | null;
  /** The Buy menu, when the game has one. */
  buy?: ReactNode;
  /**
   * The journal's door (Y9b), when the game declares one: `accountDeck` =
   * owned through the session — this browser holds no claim token (the
   * journal is account-only; a guest owner's dialog asks them to sign in).
   */
  journal?: { game: GameId; accountDeck: boolean } | null;
}) {
  const copy = useCopyToClipboard();
  const [logOpen, setLogOpen] = useState(false);
  const logRef = useRef<HTMLButtonElement | null>(null);
  const hasJournal = journal !== null;

  // Owners only reach this row: fetch the dialog's chunk before the tap.
  useEffect(() => {
    if (hasJournal) preloadLogGameDialog();
  }, [hasJournal]);

  const share = async () => {
    const url = `${window.location.origin}/d/${publicId}`;
    if (canShareNatively()) {
      try {
        await navigator.share({ title: deckName, url });
        return;
      } catch (err) {
        // Closing the sheet is the person's choice, not a failure.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    copy.copy(url, "link");
  };

  return (
    <>
      {journal && (
        <Button ref={logRef} variant="outline" size="sm" onClick={() => setLogOpen(true)}>
          {JOURNAL_COPY.logHeading}
        </Button>
      )}
      <Button
        nativeButton={false}
        variant="outline"
        size="sm"
        render={<Link href={`/decks/${deckId}/edit`} />}
      >
        Open in editor
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          Copy
          <ChevronDownIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuItem onClick={() => copy.copy(decklist(), "decklist")}>
            Copy decklist
          </DropdownMenuItem>
          {tableText && (
            <DropdownMenuItem onClick={() => copy.copy(tableText(), "table")}>
              {BRACKET_COPY.copyForTable}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" onClick={() => void share()}>
        Share…
      </Button>
      {buy}
      <CopyStatus copy={copy} copied={COPIED[copy.what ?? ""] ?? "Copied"} />
      {logOpen && journal && (
        <LazyLogGameDialog
          deckId={deckId}
          game={journal.game}
          accountDeck={journal.accountDeck}
          returnPath={`/d/${publicId}`}
          finalFocus={logRef}
          onClose={() => setLogOpen(false)}
        />
      )}
    </>
  );
}
