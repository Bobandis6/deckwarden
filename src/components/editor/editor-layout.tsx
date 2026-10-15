"use client";

/**
 * EditorLayout (R4, REDESIGN.md §2 "Responsive structure"): the builder's
 * three tiers over ONE element tree, so no pane ever remounts because the
 * window changed size.
 *
 * - `wide:` (1200 px and up): three grid panes — search · deck · tools.
 * - `md:` (768–1199 px): search · deck side by side; the tools content in
 *   a right-docked, NON-modal Drawer (the deck stays interactive beside it,
 *   and an explicit inspection updates its Card tab without closing it).
 * - Below 768 px: one active pane under a fixed Deck / Search / Tools
 *   bottom bar (Base UI Tabs); the other two panes stay mounted, so a
 *   query, a preview and a tool's fetched results all survive a switch.
 *
 * CSS decides the layout: the pane widths are `md:` / `wide:` grid classes
 * and the phone panes show or hide from the root's `data-pane` attribute
 * (`group-data-[pane=…]/panes:block`), synchronously with the state, so a
 * switch never paints two panes for a frame. Base UI's own `hidden` and
 * `inert` on inactive panels are overridden for that reason — at `md` and
 * up every panel is visible, and there the tabpanel role goes too (the
 * bar is display:none; the sections read as labelled regions). The ONE
 * thing JavaScript decides is `tier` (useTier): where the tools content
 * mounts (the third pane, the Drawer, or the Tools tab) and which of the
 * two sheets exists. Crossing 768 or 1200 px therefore remounts the tools
 * panels — their fetched results refetch once while their tab is active —
 * and nothing else.
 *
 * `display: none` drops an element's scroll position, so each pane records
 * its `scrollTop` as it scrolls and is restored in a layout effect when it
 * comes back (a tab change, or a tier change revealing every pane).
 *
 * The root is `h-dvh` at every tier: each section is its own scroll
 * container, so the sticky search block and the sticky group headers stick
 * inside their pane everywhere, and the phone's document never scrolls
 * under the bar. Two things ride the viewport's bottom edge from outside
 * this tree — the toast viewport and R2's credit chip — and both read
 * `--editor-bottom-inset` (the bar's height plus the safe-area inset below
 * `md`, 0 from it) to sit above the bar; the same class sets it on the
 * root and on the portaled toast viewport (EDITOR_BOTTOM_INSET_CLASS).
 *
 * The phone card sheet is a bottom Drawer opened ONLY by explicit
 * inspection (DeckEditor decides — typing, adds, `/` and tab changes never
 * open it); `Drawer.VirtualKeyboardProvider` sits inside its root (it reads
 * the drawer's store — it cannot wrap the editor) so the tag input scrolls
 * clear of the software keyboard. Neither drawer creates a deck or marks
 * anything dirty: they are layout, not edits.
 *
 * U3b (WAVE5 D4): the phone's tab bar is the chrome material, its top
 * hairline kept, so the pane scrolling under it shows through, softened;
 * the drawers stay opaque.
 *
 * U4b (WAVE5 D5, F9): the card sheet has three snap points, a 9rem peek
 * (the name, the cost line and the actions), the half (the card) and the
 * full point (the text, tags and printings; the popup's own height,
 * 100dvh − 6rem). It opens at the half and is modal only at the full point:
 * at the peek and the half the deck rows behind it stay tappable, and a tap
 * on another row swaps the body in place (keyed on the card, a 250 ms fade
 * on settle-250; the first body never fades, the frame never moves). The
 * scrim is 40 % at the full point and fades with the snap progress below
 * it (Base UI's own progress, so a drag toward the half fades it under the
 * finger); it never blocks a tap below full. A release after a swipe runs
 * on flick-400, a tap or Escape on settle-400 (DrawerContent's
 * `flickRelease`). The body is the caller's, rendered per point.
 */
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { LayersIcon, SearchIcon, WrenchIcon, XIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { CHROME_CLASS } from "@/components/chrome-material";
import type { EditorTier } from "@/components/editor/use-tier";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type EditorPane = "deck" | "search" | "tools";

const PANES: readonly EditorPane[] = ["search", "deck", "tools"];

/** Where the phone card sheet rests (U4b): what its body shows depends on it. */
export type SheetPoint = "peek" | "half" | "full";

type SnapPoint = DrawerPrimitive.Root.SnapPoint;
const SHEET_PEEK: SnapPoint = "9rem";
const SHEET_HALF: SnapPoint = 0.55;
const SHEET_FULL: SnapPoint = 1;
/** The sheet's snap points, smallest first (Base UI resolves each against the viewport). */
const SHEET_SNAP_POINTS: SnapPoint[] = [SHEET_PEEK, SHEET_HALF, SHEET_FULL];

function sheetPoint(snap: SnapPoint | null): SheetPoint {
  if (snap === SHEET_PEEK) return "peek";
  if (snap === SHEET_FULL) return "full";
  return "half";
}

/** The sheet's scrim: 40 % at the full point, faded to nothing with the snap progress below it. */
const SHEET_SCRIM_CLASS =
  "bg-black/40 supports-backdrop-filter:backdrop-blur-none data-snap-points:[--drawer-overlay-min-opacity:0]";

/**
 * `--editor-bottom-inset`: the bar (3.5rem) plus the device's bottom
 * safe-area inset below `md`, 0px from it. On the editor root AND on the
 * portaled toast viewport (which renders outside the root, where the
 * root's variable cannot reach).
 */
export const EDITOR_BOTTOM_INSET_CLASS =
  "[--editor-bottom-inset:calc(3.5rem_+_env(safe-area-inset-bottom))] md:[--editor-bottom-inset:0px]";

/** The toast viewport's offset: above the bar on phones, the primitive's 1rem elsewhere. */
export const EDITOR_TOAST_VIEWPORT_CLASS = cn(
  EDITOR_BOTTOM_INSET_CLASS,
  // z-60: above the md tools drawer (z-50), which docks where toasts land.
  "bottom-[calc(var(--editor-bottom-inset)_+_1rem)] z-60",
);

/** R2's credit chip: 0.5rem above the bar (the chip's own `bottom-2`, plus the inset). */
export const EDITOR_CREDIT_INSET = "calc(var(--editor-bottom-inset, 0px) + 0.5rem)";

// pb-8: the last content of a pane can scroll clear of R2's credit chip
// (28 px, bottom-left, over the pane's last rows) — the R2 block's observed
// overlap; on phones the chip spans the whole pane width, so it matters.
const SECTION_CLASS = "min-h-0 overflow-y-auto pb-8 text-base";

const TRIGGER_CLASS =
  "h-14 min-h-11 flex-1 flex-col gap-0.5 rounded-none px-1 py-1 text-xs [&_svg:not([class*='size-'])]:size-5";

export interface EditorLayoutProps {
  tier: EditorTier;
  gameId: string;
  header: ReactNode;
  /** The editor's Modal dialogs (portaled; rendered here so they sit inside the game-accent root). */
  dialogs: ReactNode;
  search: ReactNode;
  deck: ReactNode;
  /** The tools content — the Card / Suggestions / Combos / Cuts tabs (or the single Card panel). */
  tools: ReactNode;
  /**
   * The phone card sheet's body (a second CardDetailPane), rendered for the
   * point the sheet rests at, with the frame's Close to place in its header
   * row; the sheet unmounts when closed.
   */
  sheet: (frame: { point: SheetPoint; close: ReactNode }) => ReactNode;
  /** The sheet's accessible name — the inspected card's name. */
  sheetTitle: string | null;
  /** The inspected card's id: a change while the sheet stays open re-targets it (U4b). */
  sheetKey: string | null;
  /** R2's ambient layer — the LAST child, so its sticky credit row sits at the surface's end. */
  ambient: ReactNode;
  activePane: EditorPane;
  onActivePaneChange: (pane: EditorPane) => void;
  toolsOpen: boolean;
  onToolsOpenChange: (open: boolean) => void;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  /** The deck's size count, shown as text on the Deck tab. */
  deckCount: number;
}

export function EditorLayout({
  tier,
  gameId,
  header,
  dialogs,
  search,
  deck,
  tools,
  sheet,
  sheetTitle,
  sheetKey,
  ambient,
  activePane,
  onActivePaneChange,
  toolsOpen,
  onToolsOpenChange,
  sheetOpen,
  onSheetOpenChange,
  deckCount,
}: EditorLayoutProps) {
  // The card sheet (U4b): it rests where the hand left it (a controlled snap
  // point) and opens at the half. A body that arrives while it stays open is
  // a re-target and fades in; the body it opened with never does. Derived
  // from the props as they change ("storing information from previous
  // renders", react.dev), so nothing waits for an effect.
  const [snap, setSnap] = useState<SnapPoint | null>(SHEET_HALF);
  const [sheetFrame, setSheetFrame] = useState({
    open: sheetOpen,
    key: sheetKey,
    swapped: false,
  });
  if (sheetFrame.open !== sheetOpen || sheetFrame.key !== sheetKey) {
    const opening = sheetOpen && !sheetFrame.open;
    const retarget = sheetOpen && sheetFrame.open && sheetFrame.key !== sheetKey;
    setSheetFrame({
      open: sheetOpen,
      key: sheetKey,
      swapped: sheetOpen && (retarget || (!opening && sheetFrame.swapped)),
    });
    if (opening) setSnap(SHEET_HALF);
  }
  const point = sheetPoint(snap);
  const full = point === "full";
  const sectionRefs = useRef<Record<EditorPane, HTMLElement | null>>({
    search: null,
    deck: null,
    tools: null,
  });
  // Each pane's last scrollTop, recorded as it scrolls (a hidden pane fires
  // no scroll events, so its entry is the position it was left at).
  const positions = useRef(new Map<EditorPane, number>());

  useLayoutEffect(() => {
    for (const pane of PANES) {
      const el = sectionRefs.current[pane];
      const saved = positions.current.get(pane);
      if (el && saved !== undefined && el.scrollTop !== saved) el.scrollTop = saved;
    }
  }, [activePane, tier]);

  // Base UI hides and inerts inactive panels; visibility is CSS's here (see
  // the docblock), and from `md` the sections stop being tab panels at all.
  const panelProps =
    tier === "phone"
      ? { hidden: false, inert: false }
      : {
          hidden: false,
          inert: false,
          role: undefined,
          "aria-labelledby": undefined,
          tabIndex: undefined,
        };

  const section = (pane: EditorPane, label: string, className: string, children: ReactNode) => (
    <TabsContent
      value={pane}
      keepMounted
      render={<section aria-label={label} />}
      ref={(el: HTMLElement | null) => {
        sectionRefs.current[pane] = el;
      }}
      onScroll={(e) => positions.current.set(pane, e.currentTarget.scrollTop)}
      className={cn(SECTION_CLASS, className)}
      {...panelProps}
    >
      {children}
    </TabsContent>
  );

  return (
    <div
      className={cn("relative isolate flex h-dvh flex-col", EDITOR_BOTTOM_INSET_CLASS)}
      data-game={gameId}
      data-tier={tier}
    >
      {header}
      {dialogs}
      {/* The panes are the page's main landmark and the skip link's target
          (U8: every page's <main id="main">; WAVE5's U3a listed the editor's
          <main>, which the skip link needed first). */}
      <Tabs
        render={<main id="main" />}
        value={activePane}
        onValueChange={(value) => onActivePaneChange(value as EditorPane)}
        data-pane={activePane}
        className="group/panes min-h-0 flex-1 gap-0 pb-(--editor-bottom-inset) md:grid md:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] wide:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)_minmax(18rem,20rem)]"
      >
        {section(
          "search",
          "Card search",
          "hidden group-data-[pane=search]/panes:block md:block md:border-r",
          search,
        )}
        {section("deck", "Deck list", "hidden group-data-[pane=deck]/panes:block md:block", deck)}
        {section(
          "tools",
          "Card detail and suggestions",
          // U3a: a column at `wide`, so the attribution that ends the content
          // (mt-auto) rests on the pane's bottom edge, not mid-pane where a
          // seeded preview would push it off screen.
          "hidden group-data-[pane=tools]/panes:block md:hidden wide:flex wide:flex-col wide:border-l",
          // At `md` the tools live in the Drawer; an empty hidden section keeps the tree stable.
          tier === "md" ? null : tools,
        )}
        {/* The bottom bar (phones only): icon over label, the live deck count
            as text, the accent indicator along the TOP edge. */}
        <TabsList
          variant="indicator"
          aria-label="Editor panes"
          className={cn(
            CHROME_CLASS,
            "fixed inset-x-0 bottom-0 z-40 w-full rounded-none border-t p-0 pb-[env(safe-area-inset-bottom)] group-data-horizontal/tabs:h-auto md:hidden",
          )}
        >
          <TabsIndicator className="top-0 bottom-auto" />
          <TabsTrigger value="deck" className={TRIGGER_CLASS}>
            <LayersIcon aria-hidden />
            <span>
              Deck<span className="text-muted-foreground"> · {deckCount}</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="search" className={TRIGGER_CLASS}>
            <SearchIcon aria-hidden />
            Search
          </TabsTrigger>
          <TabsTrigger value="tools" className={TRIGGER_CLASS}>
            <WrenchIcon aria-hidden />
            Tools
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tier === "md" && (
        // Non-modal with pointer dismissal off: the deck stays interactive
        // beside it and a deck-row click (which moves focus outside) updates
        // the Card tab instead of closing it; Escape and Close still close.
        // keepMounted: the panels' fetched results survive a close / reopen.
        <Drawer
          open={toolsOpen}
          onOpenChange={(open) => onToolsOpenChange(open)}
          modal={false}
          disablePointerDismissal
          swipeDirection="right"
          showSwipeHandle
        >
          <DrawerContent keepMounted data-game={gameId} className="border-l">
            <div className="flex h-10 shrink-0 items-center justify-between border-b pr-2 pl-3">
              <DrawerTitle className="text-sm font-medium">Tools</DrawerTitle>
              <DrawerClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close tools"
                    className="pointer-coarse:size-11"
                  />
                }
              >
                <XIcon />
              </DrawerClose>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{tools}</div>
          </DrawerContent>
        </Drawer>
      )}

      {tier === "phone" && (
        // Modal only at the full point, and pointer dismissal off below it:
        // a tap on the deck behind the peek or the half re-targets the sheet
        // (DeckEditor's explicit inspection) instead of closing it. Escape,
        // Close and a swipe down close it from every point; closing resets
        // the point to the half (defaultSnapPoint).
        <Drawer
          open={sheetOpen}
          onOpenChange={(open) => onSheetOpenChange(open)}
          snapPoints={SHEET_SNAP_POINTS}
          snapPoint={snap}
          defaultSnapPoint={SHEET_HALF}
          onSnapPointChange={(next) => setSnap(next)}
          modal={full}
          disablePointerDismissal={!full}
          showSwipeHandle
        >
          <DrawerPrimitive.VirtualKeyboardProvider>
            <DrawerContent
              data-game={gameId}
              overlay="always"
              overlayClassName={cn(SHEET_SCRIM_CLASS, !full && "pointer-events-none")}
              flickRelease
              className="shadow-lg"
            >
              <DrawerTitle className="sr-only">{sheetTitle ?? "Card"}</DrawerTitle>
              <div
                key={sheetKey ?? ""}
                data-slot="sheet-body"
                data-point={point}
                data-swapped={sheetFrame.swapped ? "" : undefined}
                className="flex min-h-0 flex-1 flex-col motion-safe:data-swapped:animate-dw-in"
              >
                {sheet({
                  point,
                  close: (
                    <DrawerClose
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Close"
                          className="pointer-coarse:size-11"
                        />
                      }
                    >
                      <XIcon />
                    </DrawerClose>
                  ),
                })}
              </div>
            </DrawerContent>
          </DrawerPrimitive.VirtualKeyboardProvider>
        </Drawer>
      )}

      {ambient}
    </div>
  );
}
