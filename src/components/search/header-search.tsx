"use client";

/**
 * HeaderSearch (HEADER-SEARCH, the owner's ask of 2026-10-24 — the first
 * half of LATER row 111; the ⌘K palette half stays parked): a card search in
 * the site header, on every page that has the header. X2's NameSuggest over
 * GET /api/cards/suggest (every card, `scope="cards"`; rows link to
 * /cards/<id> with the type line as their detail), inside a real GET form
 * to /cards: Enter with no highlighted row, or the footer row "Show every
 * card matching “…”", opens the full results, and the form works before
 * hydration (the input is `name="q"`, which /cards reads, and NameSuggest
 * brings the invisible default button implicit submission needs).
 *
 * Caching intent: nothing new. The island asks only after typing (no
 * request on page load), and the suggest route keeps its own CDN header
 * (`s-maxage=3600`). It reads no request data — only the path, through
 * usePathname, as the nav beside it does — so no page changes mode.
 *
 * The game: the open page's, read off `data-game` (pageGame) when the
 * reader focuses or types, never at render, so the server HTML has one
 * shape; Magic when the page names none. When that game has no rows for a
 * key, NameSuggest asks the other game once and shows its rows under a line
 * naming both by their short names (GAME_NAMES — never the adapter
 * registry, which every page would ship). Enter and the footer follow the game that answered the
 * text in the box: a hidden `game=optcg` rides along whenever One Piece is
 * the game, the answering one for this text or else the page's.
 *
 * Two layouts, one form (so one search landmark, "Cards", and one combobox,
 * "Search cards"):
 * - md and up: the box sits inline before the account slot, growing to
 *   24 rem, h-9 inside the h-14 row. Below lg the Appearance label and the
 *   account name show as icons, so a 768 px row leaves the box about
 *   225 px (measured signed out). It is a container: under 10 rem the
 *   placeholder and the `/` keycap step aside and the icon stays, a floor
 *   for rows narrower than any measured.
 * - Below md: a 44 px search button in the right-hand cluster. A tap opens
 *   the same form as a full-width row laid OVER the header row (absolute,
 *   same height: nothing shifts), the input focused inside the tap —
 *   `flushSync` the open, then `.focus()` synchronously, because iOS raises
 *   the keyboard only for focus inside the gesture (Base UI's Dialog and
 *   Popover move focus a frame later). While it is open the header row's
 *   own controls are hidden (site-header.tsx), so Tab never lands under the
 *   row. Close, Esc with the popup shut, and a route change close it, and
 *   focus goes back to the search button. Closing keeps the text.
 *
 * `/` jumps to the box (and selects its text) from anywhere but the editor
 * routes, where `/` is the editor's own search (use-editor-hotkeys.ts): not
 * while typing in a field, not with a modifier, not inside an open dialog or
 * menu (isTextTarget). The keycap hint shows only where `/` works, and only
 * for a fine pointer.
 */
import { SearchIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";

import { isTextTarget } from "@/components/editor/use-editor-hotkeys";
import type { SwitchGame } from "@/components/game-switch";
import { NameSuggest } from "@/components/search/name-suggest";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { nameKey } from "@/lib/search/name-key";
import { cn } from "@/lib/utils";

/** Tailwind's `md`: the inline box from here up, the phone's button and row below it. */
const WIDE_QUERY = "(width >= 48rem)";

const OTHER_GAME: Record<SwitchGame, SwitchGame> = { mtg: "optcg", optcg: "mtg" };

/**
 * The games as the fallback line names them: "No Magic cards match. 3 One
 * Piece cards." GameSwitch's labels are the full names ("Magic: The
 * Gathering"), whose colon reads badly inside a sentence; the tiles' short
 * labels live beside the adapter registry, which the header must not ship.
 */
const GAME_NAMES: Record<SwitchGame, string> = { mtg: "Magic", optcg: "One Piece" };

/**
 * The input's look: ui/input.tsx's recipe (the edge token, the focus ring,
 * 16 px text on phones so iOS never zooms in, the 44 px coarse floor) at
 * h-9, with room for the icon on the left and the keycap on the right.
 */
const INPUT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-(--border-control) bg-card py-1 pr-2.5 pl-8 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:pr-8 md:text-sm dark:bg-input/30 pointer-coarse:min-h-11 @max-[10rem]/search:placeholder:text-transparent";

/** The editor routes (/decks/new, /decks/[id]/edit), where `/` belongs to the editor. */
export function isEditorPath(pathname: string | null): boolean {
  return pathname === "/decks" || (pathname?.startsWith("/decks/") ?? false);
}

/**
 * The open page's game: `data-game` on `#main` (the indexes, the hubs, a
 * card, a deck's share page) or on an ancestor of it (the editor's root);
 * null when the page names none. Never an element inside it: on /account
 * and /u/ the first one is a deck tile, whose game is that deck's, not the
 * page's.
 */
export function pageGame(): SwitchGame | null {
  const game = document.getElementById("main")?.closest("[data-game]")?.getAttribute("data-game");
  return game === "mtg" || game === "optcg" ? game : null;
}

/** The form's `q` input (NameSuggest's), looked up when a key or a tap needs it. */
function searchInput(form: HTMLFormElement | null): HTMLInputElement | null {
  const field = form?.elements.namedItem("q");
  return field instanceof HTMLInputElement ? field : null;
}

export function HeaderSearch() {
  const pathname = usePathname();
  const onEditor = isEditorPath(pathname);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [text, setText] = useState("");
  /** The open page's game, as last read (focus, typing). */
  const [game, setGame] = useState<SwitchGame>("mtg");
  /** The last answer's key and the game whose rows it showed. */
  const [answered, setAnswered] = useState<{ key: string; game: SwitchGame } | null>(null);
  /** Phones: the search row is laid over the header row. */
  const [open, setOpen] = useState(false);

  // A route change closes the row while rendering (no effect, no extra
  // paint), and remembers that it did so the focus can follow it.
  const [route, setRoute] = useState({ path: pathname, closedRow: false });
  if (route.path !== pathname) {
    setRoute({ path: pathname, closedRow: open });
    if (open) setOpen(false);
  }
  useEffect(() => {
    if (!route.closedRow) return;
    // Focus was in the row (or fell to the body when it hid): back to the button.
    const active = document.activeElement;
    if (!active || active === document.body || formRef.current?.contains(active)) {
      buttonRef.current?.focus();
    }
  }, [route]);

  useEffect(() => {
    if (onEditor) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTextTarget(e.target)) return;
      const input = searchInput(formRef.current);
      if (!input) return;
      e.preventDefault(); // or the slash would land in the box
      const wide = typeof window.matchMedia !== "function" || window.matchMedia(WIDE_QUERY).matches;
      if (!wide) flushSync(() => setOpen(true));
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEditor]);

  const readGame = () => setGame(pageGame() ?? "mtg");

  /** The tap that opens the row focuses its input in the same task (iOS keyboard). */
  const openRow = () => {
    flushSync(() => setOpen(true));
    searchInput(formRef.current)?.focus();
  };

  const closeRow = () => {
    flushSync(() => setOpen(false));
    buttonRef.current?.focus();
  };

  // Esc with the popup shut closes the row — before Base UI's own Esc, which
  // would clear the text. With the popup open, Esc is the popup's.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Escape" || !open) return;
    if (e.target instanceof Element && e.target.getAttribute("aria-expanded") === "true") return;
    e.preventDefault();
    e.stopPropagation();
    closeRow();
  };

  const submitGame = answered !== null && answered.key === nameKey(text) ? answered.game : game;

  return (
    <>
      <form
        ref={formRef}
        id={formId}
        role="search"
        aria-label="Cards"
        action="/cards"
        method="get"
        data-slot="header-search"
        data-search-open={open ? "" : undefined}
        onFocus={readGame}
        onKeyDownCapture={onKeyDownCapture}
        className={cn(
          "group/search @container/search min-w-0 items-center gap-2",
          open ? "bg-background visible absolute inset-0 z-10 flex px-4" : "hidden",
          "md:static md:z-auto md:mr-2 md:flex md:max-w-sm md:flex-1 md:bg-transparent md:px-0",
        )}
      >
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <NameSuggest
            game={game}
            scope="cards"
            rowHref={{ prefix: "/cards/", key: "id" }}
            detail="type"
            name="q"
            value={text}
            onValueChange={(next) => {
              setText(next);
              readGame();
            }}
            footerNoun="card"
            placeholder="Search cards…"
            aria-label="Search cards"
            inputClassName={INPUT_CLASS}
            fallback={{ game: OTHER_GAME[game], names: GAME_NAMES }}
            onAnswer={setAnswered}
          />
          {!onEditor && (
            <Kbd
              aria-hidden
              data-slot="header-search-hint"
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 max-md:hidden pointer-coarse:hidden group-focus-within/search:hidden @max-[10rem]/search:hidden"
            >
              /
            </Kbd>
          )}
        </div>
        {submitGame === "optcg" && <input type="hidden" name="game" value="optcg" />}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close search"
          className="md:hidden"
          onClick={closeRow}
        >
          Close
        </Button>
      </form>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Search cards"
        aria-expanded={open}
        aria-controls={formId}
        className={cn("md:hidden", open && "invisible")}
        onClick={openRow}
      >
        <SearchIcon />
      </Button>
    </>
  );
}
