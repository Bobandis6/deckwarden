"use client";

/**
 * The /decks/new game picker (P4.2) — the moment Deckwarden stops being an
 * MTG site with OP data. Games come off the adapter registry (each with its
 * first — currently only — format), so a new game is a registry entry here,
 * not a UI change.
 *
 * ?game=<id> deep-links straight into the editor (still draft mode — no
 * server row until the first real edit, the P2.8 contract); no param renders
 * the picker. useSearchParams keeps the page shell static (Suspense at the
 * page level).
 *
 * Y2b (WAVE4 D2): each game card carries the start doors under it — Pick
 * a commander / leader, Paste a list, Start from a precon, Surprise me,
 * whichever the adapter declares (src/lib/decks/start-doors.ts) — and
 * `?import=1` is a one-shot latch like `?surprise=1`: the draft opens with
 * the Import dialog, and the param leaves the URL.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { DeckEditor } from "@/components/editor/deck-editor";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { startDoorHref, startDoors } from "@/lib/decks/start-doors";
import { listAdapters } from "@/lib/games/registry";
import type { GameId } from "@/lib/games/types";

export function NewDeckChooser() {
  const params = useSearchParams();
  const adapters = listAdapters();
  // LATCHED, not derived: the editor's first save replaceStates the URL to
  // /decks/[id]/edit, dropping ?game= — a derived value would swap the live
  // editor back to the picker mid-edit. Once chosen, the editor stays.
  const paramGame = params.get("game");
  const [gameId, setGameId] = useState(paramGame);
  // The hub CTA's leader (P4.6) — an external key ("OP15-058"), latched like
  // the game so the first save's URL swap can't un-seed a live editor.
  const paramLeader = params.get("leader");
  const [leaderKey] = useState(paramLeader);
  // "Start from this precon" (W8b) — a precon slug, latched the same way.
  const paramFrom = params.get("from");
  const [fromSlug] = useState(paramFrom);
  // "Build around this combo" (X3) — a Spellbook key, latched like `leader`
  // and kept in the URL like it (a reload re-seeds, the sheet stays shut).
  const paramCombo = params.get("combo");
  const [comboKey] = useState(paramCombo);
  // ?surprise=1 / ?autofill=1 (W9c): one-shot latches like the above, but
  // ALSO adjusted during render (the picker's own "Surprise me" button
  // navigates here without a remount) and stripped from the URL below — a
  // reload must never re-roll a leader or re-open the sheet (the sheet's
  // open spends a deckAutofill unit).
  const paramSurprise = params.get("surprise") !== null;
  const [surprise, setSurprise] = useState(paramSurprise);
  const paramAutofill = params.get("autofill") !== null;
  const [autofill, setAutofill] = useState(paramAutofill);
  // ?import=1 (Y2b): the Paste a list door — the same one-shot latch; a
  // reload must never re-open the dialog.
  const paramImport = params.get("import") !== null;
  const [pasteList, setPasteList] = useState(paramImport);
  // Adjust-state-during-render (the React-docs pattern): latch a present
  // param, ignore its later disappearance.
  if (paramGame && paramGame !== gameId) setGameId(paramGame);
  if (paramSurprise && !surprise) setSurprise(true);
  if (paramAutofill && !autofill) setAutofill(true);
  if (paramImport && !pasteList) setPasteList(true);
  const chosen = adapters.find((a) => a.id === gameId);

  // Strip the latched one-shot params without a history entry; ?game=,
  // ?leader= and ?combo= stay (the first save's replaceState drops them, as
  // before).
  useEffect(() => {
    const url = new URL(window.location.href);
    const oneShot = ["surprise", "autofill", "import"];
    if (!oneShot.some((name) => url.searchParams.has(name))) return;
    for (const name of oneShot) url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url);
  }, [params]);

  if (chosen) {
    // Editor routes carry no site header: the editor renders its own (R3),
    // appearance menu included — one appearance control per page. Every
    // latched seed goes through as-is: the editor's one precedence rule
    // (from > surprise > combo > leader) decides which single seeder runs.
    return (
      <DeckEditor
        deckId={null}
        draftGame={chosen.id as GameId}
        draftFormat={chosen.formats[0].code}
        draftLeaderKey={leaderKey ?? undefined}
        draftFromSlug={fromSlug ?? undefined}
        draftSurprise={surprise || undefined}
        draftComboKey={comboKey ?? undefined}
        draftAutofill={autofill || undefined}
        draftImport={pasteList || undefined}
      />
    );
  }

  return (
    <>
      {/* The picker is a site page (REDESIGN.md §2) and renders the shell
          itself — header and footer (R4) — because /decks/new stands outside
          the (site) group for the editor branch's sake. */}
      <SiteHeader />
      <main className="max-w-reading mx-auto flex w-full flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Start a new deck</h1>
          <p className="text-muted-foreground mt-1">Pick your game.</p>
        </div>
        <div className="grid w-full gap-4 sm:grid-cols-2">
          {adapters.map((adapter) => {
            const format = adapter.formats[0];
            // "Leader + 50 cards" when the command zone sits outside the count
            // (OP); plain "100 cards" when it's inside it (Commander).
            const leaderOutsideCount = format.zones.some(
              (z) => z.isLeaderZone && !z.countsTowardSize,
            );
            const size = leaderOutsideCount
              ? `${adapter.display.leaderNoun} + ${format.deckSize.min} cards`
              : `${format.deckSize.min} cards`;
            return (
              // The cards keep their own height (no flex-1): the door rows
              // below them differ per game (Y2b), and a stretched card would
              // grow by the difference.
              <div key={adapter.id} className="flex flex-col gap-2">
                <Link
                  href={`/decks/new?game=${adapter.id}`}
                  replace
                  className="hover:border-foreground/40 focus-visible:ring-ring/50 flex flex-col gap-1 rounded-lg border p-6 outline-none focus-visible:ring-2"
                >
                  <span className="text-lg font-medium">{adapter.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {format.label} · {size}
                  </span>
                </Link>
                {/* The start doors (Y2b) — whichever the adapter declares;
                    Surprise me (W9c) only where it declares autofill, so
                    the other game's roll stays reachable by URL, doorless.
                    Paste a list and Surprise me land on this game's draft
                    through the latches above (replace, like the card);
                    the index doors are ordinary pages. */}
                <ul
                  aria-label={`Other ways to start a ${adapter.name} deck`}
                  className="flex flex-wrap gap-x-4 gap-y-1"
                >
                  {startDoors(adapter, format).map((door) => (
                    <li key={door.kind}>
                      <Link
                        href={startDoorHref(door, adapter.id)}
                        replace={door.kind === "paste" || door.kind === "surprise"}
                        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                      >
                        {door.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
