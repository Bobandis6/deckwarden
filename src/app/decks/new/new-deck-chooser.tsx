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
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { DeckEditor } from "@/components/editor/deck-editor";
import { SiteHeader } from "@/components/site-header";
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
  // Adjust-state-during-render (the React-docs pattern): latch a present
  // param, ignore its later disappearance.
  if (paramGame && paramGame !== gameId) setGameId(paramGame);
  const chosen = adapters.find((a) => a.id === gameId);

  if (chosen) {
    // Editor routes carry no site header: the editor renders its own (R3),
    // appearance menu included — one appearance control per page.
    return (
      <DeckEditor
        deckId={null}
        draftGame={chosen.id as GameId}
        draftFormat={chosen.formats[0].code}
        draftLeaderKey={leaderKey ?? undefined}
      />
    );
  }

  return (
    <>
      {/* The picker is a site page (REDESIGN.md §2) and renders the shell
          itself: /decks/new stands outside the (site) group for the editor
          branch's sake. */}
      <SiteHeader />
      <main className="max-w-reading mx-auto flex w-full flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Start a new deck</h1>
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
              <Link
                key={adapter.id}
                href={`/decks/new?game=${adapter.id}`}
                replace
                className="hover:border-foreground/40 focus-visible:ring-ring/50 flex flex-col gap-1 rounded-lg border p-6 outline-none focus-visible:ring-2"
              >
                <span className="text-lg font-medium">{adapter.name}</span>
                <span className="text-muted-foreground text-sm">
                  {format.label} · {size}
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
