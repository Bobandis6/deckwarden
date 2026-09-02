"use client";

/**
 * Fork affordances (P3.6).
 *
 * ForkButton — share-page action. Signed in: POST /api/decks/[id]/fork,
 * then straight into the new deck's editor. Signed out: a link to sign-in
 * (forks are account-only, forks.ts explains why), same pattern as the
 * engagement buttons.
 *
 * ForkCreditLine — "Forked from …" for the share page and the editor
 * header, rendering each credit state honestly: a link when the upstream
 * is readable, name-less when it's private, and nothing at all when the
 * pointer is gone (the caller doesn't render this with a null credit).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ForkCredit } from "@/lib/decks/fork-credit";

export function ForkButton({ deckId, signedIn }: { deckId: string; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Button
        nativeButton={false}
        variant="outline"
        size="sm"
        title="Sign in to fork decks"
        render={<Link href="/account" />}
      >
        Fork
      </Button>
    );
  }

  const fork = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/fork`, { method: "POST" });
      if (res.status === 429) throw new Error("Too many forks for now — try again later.");
      if (!res.ok) throw new Error(`Couldn't fork this deck (${res.status}).`);
      const json: { deck: { id: string } } = await res.json();
      router.push(`/decks/${json.deck.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        title="Copy this deck into your account, with credit"
        onClick={() => void fork()}
      >
        {busy ? "Forking…" : "Fork"}
      </Button>
      {error && (
        <p aria-live="polite" className="text-destructive w-full text-xs">
          {error}
        </p>
      )}
    </>
  );
}

export function ForkCreditLine({
  credit,
  className = "",
}: {
  credit: ForkCredit;
  className?: string;
}) {
  return (
    <span className={`text-muted-foreground text-xs ${className}`}>
      {credit.state === "linked" ? (
        <>
          Forked from{" "}
          <Link
            href={`/d/${credit.publicId}`}
            className="text-foreground break-words hover:underline"
          >
            {credit.name}
          </Link>
        </>
      ) : (
        "Forked from a private deck"
      )}
    </span>
  );
}
