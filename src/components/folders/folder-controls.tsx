"use client";

/**
 * Per-folder controls on /account (P2.2): visibility select, inline rename,
 * delete. All three PATCH/DELETE /api/folders/[id] then router.refresh() —
 * the account page's server render is the single source of truth for the
 * folder sections. Delete only unfiles the decks inside (FK SET NULL); the
 * confirm copy says exactly that so nobody fears losing decks.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const VISIBILITY_HINTS: Record<string, string> = {
  public: "Public — on your profile",
  unlisted: "Unlisted — link only",
  private: "Private — only you",
};

export function FolderControls({
  folderId,
  name,
  visibility,
}: {
  folderId: string;
  name: string;
  visibility: "public" | "unlisted" | "private";
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json: { error?: string } = await res.json();
        setError(json.error ?? "Couldn't update the folder.");
        return;
      }
      setRenaming(false);
      router.refresh();
    } catch {
      setError("Couldn't update — try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(`Delete the folder "${name}"? The decks inside it are kept, unfiled.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setError("Couldn't delete the folder.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't delete — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {renaming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim() !== "" && newName.trim() !== name) {
              void patch({ name: newName.trim() });
            } else {
              setRenaming(false);
            }
          }}
          className="flex items-center gap-1.5"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            autoFocus
            aria-label={`Rename folder ${name}`}
            className="border-input w-36 rounded-md border bg-transparent px-2 py-0.5 text-xs outline-none"
          />
          <Button size="sm" type="submit" disabled={busy}>
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              setRenaming(false);
              setNewName(name);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <select
            value={visibility}
            disabled={busy}
            aria-label={`Visibility of folder ${name}`}
            onChange={(e) => void patch({ visibility: e.target.value })}
            className="border-input rounded-md border bg-transparent px-1.5 py-0.5 text-xs outline-none"
          >
            {Object.entries(VISIBILITY_HINTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
            Delete
          </Button>
        </>
      )}
      {error && (
        <p aria-live="polite" className="text-destructive w-full text-right text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
