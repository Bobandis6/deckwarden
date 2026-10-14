"use client";

/**
 * The editor's own header (R3, REDESIGN.md §2 "Header"): the mark → home ·
 * the game / format chip · the deck name · save status in a FIXED-WIDTH slot
 * (F9 — the four states never shift the row, and "Save failed" + Retry stay
 * visible outside any menu) · Share as the primary action once a server row
 * exists (a draft has nothing to share, so nothing shows) · More (Details,
 * Import, Autofill…, Fit my budget… (Y8), Export, Buy, History, Games… (Y9a)
 * — History and Games… only with a live deck, Games… only where the
 * adapter declares a journal; Autofill and Fit only where the adapter
 * declares them — and the keyboard-shortcut sheet, so `?` is discoverable
 * by mouse) ·
 * the appearance menu. That last one retires R1b's AppearanceRow: exactly
 * one appearance control per page, and on the editor routes it is this one.
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
 *
 * Y2a (WAVE4 D2): a draft — no server row yet — says "Draft" in the save
 * slot ("Saves on your first change", no check mark) instead of a "Saved"
 * that nothing earned. `data-status` keeps the autosave state and
 * `data-draft` marks the draft, so every `data-status` pin holds. A SEEDED
 * draft (a precon, a combo, Surprise me, a chosen leader) shows "Keep this
 * deck" where Share will be: the explicit acceptance that mints the row.
 *
 * U3a (WAVE5 D4, fixed slots): Keep this deck and Share share one primary
 * slot of fixed width (7.5rem, the wider of the two) that is in the tree
 * while empty, so the cluster never widens when a seed lands or a row is
 * minted. The two never show together: Keep needs a draft, Share a server
 * row. On phones the slot steps aside (`display: contents`) — a reserved
 * 7.5rem overflows the phone header at 375 and 360 px for every saved deck,
 * and the phone's header rows are U4a's.
 *
 * U3b (WAVE5 D4, the materials): the header is the chrome material over
 * the ambient art (CHROME_CLASS), keeping its hairline: the panes' rules
 * meet it, and nothing scrolls under it, so there is no scroll edge for a
 * fade to replace. The name never drops under 8rem: from `wide` the game ·
 * format chip shrinks with it, its words truncating, and alone once the name
 * is at its floor; from `md` to `wide` the chip hides (which also lets the
 * md header's first row hold the cluster at 768 px). Phones keep the chip
 * until U4a.
 */
import { CheckIcon, EllipsisIcon, PanelRightIcon } from "lucide-react";
import Link from "next/link";
import { type Ref, useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { CHROME_CLASS } from "@/components/chrome-material";
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
import { cn } from "@/lib/utils";

/**
 * The editor's dialogs, each opened from the header (or `?` for the sheet;
 * "bracket", Y4a's Why sheet, from the deck pane's bracket line only).
 */
export type EditorDialog =
  | "details"
  | "import"
  | "autofill"
  | "export"
  | "buy"
  | "share"
  | "history"
  | "shortcuts"
  | "bracket"
  // Y7b: the swap sheets — a deck row's or the callout's "Swap…", and "Swap in…".
  | "swap"
  | "swap-in"
  // Y8: the Fit sheet — More's "Fit my budget…" or the goals line's "Fit my budget".
  | "fit"
  // Y9a: the Games dialog — More's "Games…" (live decks, games with a journal).
  | "games";

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
  draft = false,
  onKeep,
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
  /** No server row exists yet (Y2a): the slot says "Draft" until the first change. */
  draft?: boolean;
  /** "Keep this deck" (Y2a) — a seeded draft's explicit save; the button renders only when given. */
  onKeep?: () => void;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-2 lg:h-14 lg:flex-nowrap lg:py-0",
        CHROME_CLASS,
      )}
    >
      <Link
        href="/"
        aria-label="Deckwarden"
        className="group/mark focus-visible:ring-ring/50 flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center"
      >
        <BrandMark className="size-8 motion-safe:transition-transform motion-safe:duration-[120ms] motion-safe:group-hover/mark:-rotate-3" />
      </Link>
      {/* U3b: the chip shrinks with the name (min-w-0, its words truncating),
          alone once the name is at 8rem, and steps aside from md to wide. */}
      <Badge
        variant="outline"
        className="text-muted-foreground min-w-0 shrink font-normal md:max-wide:hidden"
      >
        <span className="truncate">
          {adapter.name} · {format.label}
        </span>
      </Badge>
      <input
        value={deckName}
        onChange={(e) => onNameChange(e.target.value)}
        aria-label="Deck name"
        placeholder="Untitled — click to name your deck"
        maxLength={120}
        className="focus-visible:ring-ring/50 order-last min-w-[8rem] basis-full rounded-md bg-transparent px-2 py-1 font-semibold outline-none focus-visible:ring-2 lg:order-none lg:flex-1 lg:basis-auto"
      />
      {/* Fork credit (P3.6) rides the name row on mobile and sits inline on desktop. */}
      {forkedFrom && (
        <ForkCreditLine
          credit={forkedFrom}
          className="order-last basis-full truncate px-2 lg:order-none lg:max-w-56 lg:basis-auto"
        />
      )}
      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        <SaveIndicator status={saveStatus} onRetry={onRetry} draft={draft} />
        <span
          data-slot="primary-slot"
          className="max-md:contents md:inline-flex md:w-[7.5rem] md:shrink-0 md:justify-end"
        >
          {onKeep ? (
            <Button size="sm" onClick={onKeep}>
              Keep this deck
            </Button>
          ) : canShare ? (
            <Button size="sm" onClick={() => onOpen("share")}>
              Share
            </Button>
          ) : null}
        </span>
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
            {/* The review sheet (W9b, D8) — only for games whose adapter
                declares recommend.autofill (One Piece shows nothing). */}
            {adapter.recommend?.autofill && (
              <DropdownMenuItem onClick={() => onOpen("autofill")}>Autofill…</DropdownMenuItem>
            )}
            {/* The Fit sheet (Y8, D9) — Swap Lab's alternatives under a deck
                total; only for games that declare recommend.swap. */}
            {adapter.recommend?.swap && (
              <DropdownMenuItem onClick={() => onOpen("fit")}>Fit my budget…</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onOpen("export")}>Export</DropdownMenuItem>
            {/* Buy links (W7, D6) — only for games whose adapter declares buy. */}
            {adapter.capabilities.buy && (
              <DropdownMenuItem onClick={() => onOpen("buy")}>Buy this deck…</DropdownMenuItem>
            )}
            {/* Versioning is a deck-level concern (P3.6): a header affordance,
                not a fourth right-pane tab. Needs a server row (not a draft). */}
            {canHistory && (
              <DropdownMenuItem onClick={() => onOpen("history")}>History</DropdownMenuItem>
            )}
            {/* The game journal (Y9a, D10) — a game logs against a saved list,
                so a draft has none; only for games whose adapter declares one. */}
            {canHistory && adapter.journal && (
              <DropdownMenuItem onClick={() => onOpen("games")}>Games…</DropdownMenuItem>
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

/** A save shows "Saving…" only once it has run this long (U2): a fast one goes "Unsaved…" → "Saved". */
export const SAVING_LABEL_AFTER_MS = 300;

/**
 * The save slot (F9): a fixed-width, right-aligned box so "Saved" →
 * "Saving…" → "Unsaved…" → "Save failed + Retry" never move the header.
 * A change of label is a two-layer cross-fade (U2, WAVE5.md D2): the new
 * label fades in on the settle-250 curve while the old one fades out on top
 * of it — a `::before` that reads `data-was`, so the slot's text stays the
 * one live label and the outgoing words are never announced. The first
 * paint doesn't fade, the check zooms in on "Saved", and reduced motion
 * keeps the cross-fade at 150 ms on opacity (globals.css). "Saving…" waits
 * for SAVING_LABEL_AFTER_MS (a flag the save sets, not a delay on the
 * label), so a quick save never flashes it; `data-status` is always the
 * real state. The live region announces the change as before. A draft
 * (Y2a) at rest reads "Draft" with no check — its first edit turns the
 * slot to "Unsaved…" like any other, and the minted row ends the draft.
 */
function SaveIndicator({
  status,
  onRetry,
  draft,
}: {
  status: SaveStatus;
  onRetry: () => void;
  draft: boolean;
}) {
  const [slowSave, setSlowSave] = useState(false);
  useEffect(() => {
    if (status !== "saving") return;
    const timer = setTimeout(() => setSlowSave(true), SAVING_LABEL_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlowSave(false);
    };
  }, [status]);
  const resting = draft && status === "saved";
  const label = resting
    ? "Draft"
    : status === "saving"
      ? slowSave
        ? "Saving…"
        : "Unsaved…"
      : status === "dirty"
        ? "Unsaved…"
        : status === "error"
          ? "Save failed"
          : "Saved";
  // The outgoing label, kept from the previous render (React's "adjust state
  // when a value changes" pattern); null until the first change.
  const [faces, setFaces] = useState<{ now: string; was: string | null }>({
    now: label,
    was: null,
  });
  if (faces.now !== label) setFaces({ now: label, was: faces.now });
  const fading = faces.was !== null;
  return (
    <span
      data-slot="save-slot"
      data-status={status}
      data-draft={draft || undefined}
      title={resting ? "Saves on your first change" : undefined}
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
          key={label}
          data-was={fading ? faces.was : undefined}
          className={cn(
            "text-muted-foreground relative inline-flex items-center gap-1",
            fading &&
              "animate-dw-in before:absolute before:top-0 before:right-0 before:whitespace-nowrap before:animate-dw-out before:content-[attr(data-was)_/_'']",
          )}
        >
          {label === "Saved" && (
            <CheckIcon
              aria-hidden
              className={cn("size-3.5", fading && "animate-dw-in [--dw-scale:0.5]")}
            />
          )}
          {label}
        </span>
      )}
    </span>
  );
}
