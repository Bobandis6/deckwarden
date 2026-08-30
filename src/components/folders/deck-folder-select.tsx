"use client";

/**
 * Per-deck folder picker on /account (P2.2): a bare <select> that PATCHes
 * the deck's folderId and refreshes, letting the server render regroup the
 * list. Session-authed decks only — the account page never lists guest
 * decks, and the API rejects filing them anyway.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface FolderOption {
  id: string;
  name: string;
}

export function DeckFolderSelect({
  deckId,
  deckName,
  currentFolderId,
  folders,
}: {
  deckId: string;
  deckName: string;
  currentFolderId: string | null;
  folders: FolderOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const move = async (folderId: string) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId === "" ? null : folderId }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      {failed && (
        <span aria-live="polite" className="text-destructive text-xs">
          move failed
        </span>
      )}
      <select
        value={currentFolderId ?? ""}
        disabled={busy}
        aria-label={`Folder for deck ${deckName}`}
        onChange={(e) => void move(e.target.value)}
        className="border-input text-muted-foreground max-w-32 truncate rounded-md border bg-transparent px-1.5 py-0.5 text-xs outline-none"
      >
        <option value="">No folder</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
    </span>
  );
}
