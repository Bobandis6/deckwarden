/**
 * The journal's toast (Y9a's, shared by its three doors since Y9b — the
 * editor's More → Games…, the share page's "Log a game", `/account`'s
 * "Log a game…"): "Logged a win · Undo", plus the capped line as the
 * description when the game logged without a list of its own. Undo is the
 * games route's DELETE — the game and, when no other game was played with
 * it, the snapshot it minted. The host closes its dialog first (a modal
 * keeps a toast's Undo out of reach) and mounts the Toaster; this module
 * only talks to the module-level toast manager.
 *
 * A plain module, not the dialog's: the share page and `/account` load the
 * dialog on demand, and their hosts import this without pulling it in.
 */
import { toast } from "@/components/ui/toast";
import { DECK_TOKEN_HEADER, getDeckToken } from "@/lib/decks/token-store";
import { JOURNAL_COPY } from "@/lib/journal/copy";
import type { LogResult } from "@/lib/journal/games";
import { MAX_PLAYED_SNAPSHOTS_PER_DECK } from "@/lib/journal/limits";

/** A game toast lives 5 s (the editor's toasts). */
export const GAME_TOAST_MS = 5000;

/** JSON plus this browser's edit key when it holds one (the games routes ignore it for account decks). */
export function journalHeaders(deckId: string): Record<string, string> {
  const token = getDeckToken(deckId);
  return {
    "Content-Type": "application/json",
    ...(token ? { [DECK_TOKEN_HEADER]: token } : {}),
  };
}

export function showLoggedToast(deckId: string, logged: LogResult): void {
  const undo = async () => {
    try {
      const res = await fetch(`/api/decks/${deckId}/games/${logged.game.id}`, {
        method: "DELETE",
        headers: journalHeaders(deckId),
      });
      if (!res.ok) throw new Error(`Undo failed (${res.status})`);
    } catch {
      toast.add({ title: JOURNAL_COPY.undoFailed, type: "error", timeout: GAME_TOAST_MS });
    }
  };
  const id = toast.add({
    title: JOURNAL_COPY.logged(logged.game.result),
    ...(logged.capped ? { description: JOURNAL_COPY.capped(MAX_PLAYED_SNAPSHOTS_PER_DECK) } : {}),
    type: "success",
    timeout: GAME_TOAST_MS,
    actionProps: {
      children: "Undo",
      onClick: () => {
        toast.close(id);
        void undo();
      },
    },
  });
}
