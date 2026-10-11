"use client";

/**
 * The Games dialog away from the editor (Y9b, WAVE4 D10) — the share page's
 * "Log a game" and `/account`'s tile ⋯ "Log a game…". Both pages load it on
 * demand (log-game-door.tsx): neither ships the dialog to a visitor, and
 * `/account` doesn't carry the adapters until a log is asked for.
 *
 * Neither page edits the list, so the saved list IS the list played: the
 * flush the editor runs first has nothing to do here (`onBeforeLog`
 * answers true at once). A log closes the dialog and raises the shared
 * toast with Undo (logged-toast.ts) on the page's own Toaster.
 */
import { GamesDialog } from "@/components/editor/games-dialog";
import { showLoggedToast } from "@/components/editor/logged-toast";
import type { SheetFinalFocus } from "@/components/editor/sheet-shell";
import { useTier } from "@/components/editor/use-tier";
import { getAdapter } from "@/lib/games/registry";
import type { GameId } from "@/lib/games/types";

/** No editor here: the saved list is the screen. */
const savedListIsTheScreen = async () => true;

export interface LogGameDialogProps {
  deckId: string;
  game: GameId;
  /** Owned through the session — false for a guest deck (this browser's claim token): the sign-in sentence. */
  accountDeck: boolean;
  /** Where the sign-in sentence returns (`?next=`). */
  returnPath: string;
  /** The door that opened it. */
  finalFocus?: SheetFinalFocus;
  onClose: () => void;
}

export default function LogGameDialog({
  deckId,
  game,
  accountDeck,
  returnPath,
  finalFocus,
  onClose,
}: LogGameDialogProps) {
  const tier = useTier();
  return (
    <GamesDialog
      deckId={deckId}
      adapter={getAdapter(game)}
      accountDeck={accountDeck}
      phone={tier === "phone"}
      returnPath={returnPath}
      finalFocus={finalFocus}
      onBeforeLog={savedListIsTheScreen}
      onLogged={(logged) => {
        onClose();
        showLoggedToast(deckId, logged);
      }}
      onClose={onClose}
    />
  );
}
