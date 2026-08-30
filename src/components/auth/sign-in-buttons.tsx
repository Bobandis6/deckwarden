"use client";

/**
 * OAuth sign-in buttons (P2.1). Discord + Google are the only providers by
 * design (build plan §2 — no email stack exists). signIn.social redirects to
 * the provider; callbackURL lands back on /account, which runs the deck-claim
 * flow.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const PROVIDERS = [
  { id: "discord", label: "Sign in with Discord" },
  { id: "google", label: "Sign in with Google" },
] as const;

export function SignInButtons() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: "discord" | "google") => {
    setPending(provider);
    setError(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/account" });
    // On success the browser navigates away; reaching here means it didn't.
    if (error) {
      setError(error.message ?? "Sign-in failed — try again.");
      setPending(null);
    }
  };

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      {PROVIDERS.map((p) => (
        <Button key={p.id} disabled={pending !== null} onClick={() => void signIn(p.id)}>
          {pending === p.id ? "Redirecting…" : p.label}
        </Button>
      ))}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
