"use client";

/**
 * /decks/new (P1.2): create a server-side deck and land in the editor.
 * Anonymous creates return the claim token exactly once — it goes into
 * localStorage keyed by deck id (token-store.ts) before the redirect; the
 * deck itself lives server-side (build plan §4). Signed-in creates (P2.1)
 * return claimToken null — the deck is account-owned from birth and the
 * session cookie is the ownership proof, so nothing is stored here.
 *
 * Caching intent: static client shell; the create call is a client-side
 * mutation on mount.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { setDeckToken } from "@/lib/decks/token-store";

export default function NewDeckPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const create = async () => {
    setError(null);
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `website` is the create route's honeypot — always sent empty.
        body: JSON.stringify({ game: "mtg", format: "commander", website: "" }),
      });
      if (!res.ok) throw new Error(`Deck creation failed (${res.status})`);
      const json: { deck: { id: string }; claimToken: string | null } = await res.json();
      if (json.claimToken && !setDeckToken(json.deck.id, json.claimToken)) {
        throw new Error(
          "Couldn't store this deck's edit key — enable browser storage and try again.",
        );
      }
      router.replace(`/decks/${json.deck.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // The ref guards Strict Mode's double effect-run from creating two decks.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      {error ? (
        <>
          <p className="max-w-md text-center">{error}</p>
          <div className="flex gap-3">
            <Button onClick={() => void create()}>Try again</Button>
            <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
              Back
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Creating your deck…</p>
      )}
    </main>
  );
}
