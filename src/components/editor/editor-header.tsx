"use client";

/**
 * The editor's own header (R3, REDESIGN.md §2 "Header"): the mark → home ·
 * the game / format chip · the deck name · save status in a FIXED-WIDTH slot
 * (F9 — the four states never shift the row, and "Save failed" + Retry stay
 * visible outside any menu) · Share as the primary action once a server row
 * exists (a draft has nothing to share, so nothing shows) · More (Details,
 * Import, Export, History — History only with a live deck — and the
 * keyboard-shortcut sheet, so `?` is discoverable by mouse) · the appearance
 * menu. That last one retires R1b's AppearanceRow: exactly one appearance
 * control per page, and on the editor routes it is this one.
 *
 * R4: a "Tools" button between Share and More on the `md` tier only
 * (`hidden md:inline-flex wide:hidden`) opens the tools drawer — phones
 * reach the tools through the Tools tab, `wide:` shows them inline. The
 * row still wraps below `lg` (the name input takes its own line): at 768 px
 * the mark, chip, save slot, Share, Tools, More and appearance already fill
 * the width, so the one-row form stays `lg:`.
 *
 * `data-game` stays on the editor root — the chip is inert. The site header
 * is never rendered on the editor (a workspace has no room for site nav),
 * and the `← Deckwarden` text link is gone: the mark is the way home, with
 * the same F13 tilt as the site header's.
 */
import { CheckIcon, EllipsisIcon, PanelRightIcon } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ForkCreditLine } from "@/components/deck/fork-button";
import type { SaveStatus } from "@/components/editor/use-autosave";
import { AppearanceMenu } from "@/components/theme/appearance-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ForkCredit } from "@/lib/decks/fork-credit";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

/** The editor's dialogs, each opened from the header (or `?` for the sheet). */
export type EditorDialog = "details" | "import" | "export" | "share" | "history" | "shortcuts";

export function EditorHeader({
  adapter,
  format,
  deckName,
  onNameChange,
  forkedFrom,
  saveStatus,
  onRetry,
  canShare,
  canHistory,
  onOpen,
  moreRef,
  onOpenTools,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  deckName: string;
  onNameChange: (name: string) => void;
  forkedFrom: ForkCredit | null;
  saveStatus: SaveStatus;
  onRetry: () => void;
  /** A server row exists (never in a pre-create draft). */
  canShare: boolean;
  /** A live deck id exists — versions need a row. */
  canHistory: boolean;
  onOpen: (dialog: EditorDialog) => void;
  /** The More trigger — the editor returns focus here when a menu-opened dialog closes. */
  moreRef?: Ref<HTMLButtonElement>;
  /** Opens the md tier's tools drawer (R4); the button renders only when given. */
  onOpenTools?: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-2 lg:h-14 lg:flex-nowrap lg:py-0">
      <Link
        href="/"
        aria-label="Deckwarden"
        className="group/mark focus-visible:ring-ring/50 flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2"
      >
        <BrandMark className="size-7 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover/mark:-rotate-3" />
      </Link>
      <Badge variant="outline" className="text-muted-foreground shrink-0 font-normal">
        {adapter.name} · {format.label}
      </Badge>
      <input
        value={deckName}
        onChange={(e) => onNameChange(e.target.value)}
        aria-label="Deck name"
        placeholder="Untitled — click to name your deck"
        maxLength={120}
        className="focus-visible:ring-ring/50 order-last min-w-0 basis-full rounded-md bg-transparent px-2 py-1 font-semibold outline-none focus-visible:ring-2 lg:order-none lg:flex-1 lg:basis-auto"
      />
      {/* Fork credit (P3.6) rides the name row on mobile and sits inline on desktop. */}
      {forkedFrom && (
        <ForkCreditLine
          credit={forkedFrom}
          className="order-last basis-full truncate px-2 lg:order-none lg:max-w-56 lg:basis-auto"
        />
      )}
      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        <SaveIndicator status={saveStatus} onRetry={onRetry} />
        {canShare && (
          <Button size="sm" onClick={() => onOpen("share")}>
            Share
          </Button>
        )}
        {onOpenTools && (
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex wide:hidden"
            onClick={onOpenTools}
          >
            <PanelRightIcon aria-hidden />
            Tools
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="More" ref={moreRef} />}
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          {/* Named "More" after its trigger, like every Base UI menu popup. */}
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={() => onOpen("details")}>Details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpen("import")}>Import</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpen("export")}>Export</DropdownMenuItem>
            {/* Versioning is a deck-level concern (P3.6): a header affordance,
                not a fourth right-pane tab. Needs a server row (not a draft). */}
            {canHistory && (
              <DropdownMenuItem onClick={() => onOpen("history")}>History</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onOpen("shortcuts")}>
              Keyboard shortcuts
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AppearanceMenu />
      </div>
    </header>
  );
}

/**
 * The save slot (F9): a fixed-width, right-aligned box so "Saved" →
 * "Saving…" → "Unsaved…" → "Save failed + Retry" never move the header.
 * Each state's label fades in (`motion-safe:`); the check zooms in on
 * "Saved". The live region announces the change as before.
 */
function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const label = status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved…" : "Saved";
  return (
    <span
      data-slot="save-slot"
      data-status={status}
      aria-live="polite"
      className="inline-flex h-7 w-36 shrink-0 items-center justify-end gap-2 text-sm tabular-nums"
    >
      {status === "error" ? (
        <>
          <span className="text-destructive">Save failed</span>
          <Button variant="destructive" size="xs" onClick={onRetry}>
            Retry
          </Button>
        </>
      ) : (
        <span
          key={status}
          className="text-muted-foreground inline-flex items-center gap-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        >
          {status === "saved" && (
            <CheckIcon
              aria-hidden
              className="size-3.5 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
            />
          )}
          {label}
        </span>
      )}
    </span>
  );
}
