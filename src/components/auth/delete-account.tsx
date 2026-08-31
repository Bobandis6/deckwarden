"use client";

/**
 * Danger zone on /account (P2.8): self-serve account deletion. Type-to-confirm
 * in the dialog, and the typed phrase itself is the DELETE body's confirm
 * field — the API re-checks it, so the ceremony isn't just decoration. On
 * success the server has already cleared the session cookie; push("/") +
 * refresh() re-renders everything session-shaped as signed out.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DELETE_CONFIRM_PHRASE } from "@/lib/profile/delete-account-phrase";

export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim().toLowerCase() === DELETE_CONFIRM_PHRASE;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: DELETE_CONFIRM_PHRASE }),
      });
      if (!res.ok) {
        const json: unknown = await res.json().catch(() => null);
        const message =
          json && typeof json === "object" && "error" in json ? String(json.error) : null;
        throw new Error(message ?? `Deletion failed (${res.status})`);
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Deleting your account permanently removes your decks, folders, likes, and bookmarks.
        </p>
        <Button
          variant="outline"
          size="xs"
          className="text-destructive shrink-0"
          onClick={() => {
            setTyped("");
            setError(null);
            setOpen(true);
          }}
        >
          Delete account…
        </Button>
      </div>
      {open && (
        <Modal label="Delete account" onClose={() => (busy ? null : setOpen(false))}>
          <p className="text-sm">
            This permanently deletes your account and everything in it — all your decks (including
            public ones), folders, likes, and bookmarks. There is no undo and no grace period.
          </p>
          <label className="text-muted-foreground block text-xs" htmlFor="delete-account-confirm">
            Type <span className="text-foreground font-mono">{DELETE_CONFIRM_PHRASE}</span> to
            confirm:
          </label>
          <input
            id="delete-account-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            className="bg-background w-full rounded-md border px-2 py-1.5 text-sm"
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={!armed || busy} onClick={run}>
              {busy ? "Deleting…" : "Delete my account"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
