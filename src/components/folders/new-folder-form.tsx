"use client";

/**
 * "New folder" control on /account (P2.2): a button that swaps to an inline
 * name input. Creates via POST /api/folders (default visibility unlisted)
 * and refreshes so the server-rendered folder sections pick it up.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function NewFolderForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (busy || name.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json: { error?: string } = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't create the folder.");
        return;
      }
      setName("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't create — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        New folder
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Folder name"
        maxLength={80}
        autoFocus
        className="border-input min-w-0 rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
      />
      <Button size="sm" type="submit" disabled={busy || name.trim() === ""}>
        {busy ? "Creating…" : "Create"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
      >
        Cancel
      </Button>
      {error && (
        <p aria-live="polite" className="text-destructive w-full text-xs">
          {error}
        </p>
      )}
    </form>
  );
}
