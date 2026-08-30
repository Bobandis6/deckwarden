"use client";

/**
 * Client gate for private decks on the share page (P1.7). The server never
 * embeds a private deck's data in HTML — ownership proof (the claim token in
 * localStorage, or since P2.1 the session cookie that rides along) reaches
 * only the authed GET /api/decks/[id]; this component fetches it and either
 * renders the full share view (owner) or the denial message (everyone else).
 * The API is the security boundary; this is just presentation.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  DeckShareView,
  type ShareDeckCard,
  type ShareDeckMeta,
} from "@/components/deck/deck-share-view";
import { Button } from "@/components/ui/button";
import { DECK_TOKEN_HEADER, getDeckToken } from "@/lib/decks/token-store";

type GateState =
  | { state: "checking" }
  | { state: "denied" }
  | { state: "ready"; deck: ShareDeckMeta; cards: ShareDeckCard[] };

export function PrivateShareGate({ deckId }: { deckId: string }) {
  const [gate, setGate] = useState<GateState>({ state: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        // Without a token the request still goes out and 403s — one code
        // path, and every setState happens after an await.
        const token = getDeckToken(deckId);
        const res = await fetch(`/api/decks/${deckId}`, {
          headers: token ? { [DECK_TOKEN_HEADER]: token } : {},
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          setGate({ state: "denied" });
          return;
        }
        const json: { deck: ShareDeckMeta; cards: ShareDeckCard[] } = await res.json();
        setGate({ state: "ready", deck: json.deck, cards: json.cards });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setGate({ state: "denied" });
      }
    })();
    return () => controller.abort();
  }, [deckId]);

  if (gate.state === "ready") return <DeckShareView deck={gate.deck} cards={gate.cards} />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      {gate.state === "checking" ? (
        <p className="text-muted-foreground">Loading deck…</p>
      ) : (
        <>
          <p className="max-w-md text-center">
            This deck is private. Only the browser that built it — or the signed-in account that
            owns it — can view it.
          </p>
          <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
            Back to Deckwarden
          </Button>
        </>
      )}
    </main>
  );
}
