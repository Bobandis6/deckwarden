"use client";

/**
 * Username picker on /account (P2.2). Setting one publishes the profile at
 * /u/[username] — the copy says so, since this is the opt-in moment. Server
 * is the validator of record (regex, reserved list, uniqueness → 400/409
 * with a message); this form just relays what it says and refreshes so the
 * server-rendered profile link picks up the change. X5 (REC-5, LATER row
 * 80): the session carries `username` now (the header's "Public profile
 * ↗"), so a save also refetches it with the 5-minute cookie cache bypassed.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { USERNAME_MAX } from "@/lib/profile/username";

export function UsernameForm({ current }: { current: string | null }) {
  const router = useRouter();
  const { refetch } = authClient.useSession();
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
      await refetch({ query: { disableCookieCache: true } });
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
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
      {/* U10a (WAVE5.md D10): one Field — the label, the row, the error or the
          saved line under it, every line in the input's aria-describedby. */}
      <Field className="gap-1.5">
        <FieldLabel>
          {current
            ? "Username: your public profile lives at /u/" + current
            : "Choose a username to publish a profile with your public decks"}
        </FieldLabel>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">deckwarden.gg/u/</span>
          <Input
            value={value}
            maxLength={USERNAME_MAX}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="username"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 font-mono"
          />
          <Button size="sm" type="submit" disabled={busy || !dirty || value.trim() === ""}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
        <FieldError>{error}</FieldError>
        {saved && !error && (
          <FieldDescription aria-live="polite">Saved. Your profile is live.</FieldDescription>
        )}
      </Field>
    </form>
  );
}
