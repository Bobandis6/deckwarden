"use client";

/**
 * OAuth sign-in buttons (P2.1). Discord + Google are the only providers by
 * design (build plan §2 — no email stack exists). signIn.social redirects to
 * the provider; callbackURL lands back on /account, which runs the deck-claim
 * flow.
 *
 * X1 (WAVE3.md D1, REC-1): with a return path the callback is
 * /account?next=<path> — still /account, because the claim runs there; the
 * page sends the visitor on once it settles. accountHref validates `next`
 * again, so the callback can never be built around an unchecked value, and
 * keeps it in the QUERY: Better Auth validates the callback's path part only
 * (pinned by callback-url.test.ts).
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { accountHref } from "@/lib/auth/next-path";
import { authClient } from "@/lib/auth-client";

const PROVIDERS = [
  { id: "discord", label: "Sign in with Discord" },
  { id: "google", label: "Sign in with Google" },
] as const;

export function SignInButtons({ next = null }: { next?: string | null }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: "discord" | "google") => {
    setPending(provider);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: accountHref(next),
    });
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
