"use client";

/**
 * The owner's action row on the share page (Y5, WAVE4 D6): Open in editor
 * · Copy ▾ (Copy decklist, Copy for the table) · Share… · Buy this deck,
 * then one status slot for all three copies. Everyone else keeps the
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
 */
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CopyStatus, useCopyToClipboard } from "@/components/copy-status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BRACKET_COPY } from "@/lib/brackets/copy";

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
}) {
  const copy = useCopyToClipboard();

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
    </>
  );
}
