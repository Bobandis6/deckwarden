"use client";

/**
 * Username picker on /account (P2.2). Setting one publishes the profile at
 * /u/[username] — the copy says so, since this is the opt-in moment. Server
 * is the validator of record (regex, reserved list, uniqueness → 400/409
 * with a message); this form just relays what it says and refreshes so the
 * server-rendered profile link picks up the change.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { USERNAME_MAX } from "@/lib/profile/username";

export function UsernameForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = value.trim().toLowerCase() !== (current ?? "");

  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      const json: { username?: string; error?: string } = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't save that username.");
        return;
      }
      setValue(json.username ?? value);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-1.5"
    >
      <label htmlFor="profile-username" className="text-muted-foreground block text-xs">
        {current
          ? "Username — your public profile lives at /u/" + current
          : "Choose a username to publish a profile with your public decks"}
      </label>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-mono text-xs">deckwarden.gg/u/</span>
        <input
          id="profile-username"
          value={value}
          maxLength={USERNAME_MAX}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="username"
          autoComplete="off"
          spellCheck={false}
          className="border-input min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 font-mono text-sm outline-none"
        />
        <Button size="sm" type="submit" disabled={busy || !dirty || value.trim() === ""}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && (
        <p aria-live="polite" className="text-destructive text-xs">
          {error}
        </p>
      )}
      {saved && !error && (
        <p aria-live="polite" className="text-muted-foreground text-xs">
          Saved — your profile is live.
        </p>
      )}
    </form>
  );
}
