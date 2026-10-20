"use client";

/**
 * Client gate for a PRIVATE GUEST deck on the share page (P1.7; keyed by
 * the public id since S6, SECURITY-AUDIT-report.md L4). The server never
 * embeds a private deck's data in HTML, and since S6 not its uuid either:
 * the page hands this gate the public id alone, so a private deck's share
 * link dispenses nothing a stranger can use. The proof is the claim token
 * in the owning browser's localStorage, keyed by the deck's uuid
 * (token-store.ts), so the gate resolves the public id the way the account
 * page resolves its "your decks" list: every token this browser holds goes
 * to POST /api/decks/mine, whose answer names the decks they prove — the
 * uuid arrives only after the proof — and the matching deck is then read
 * through the token-authed GET /api/decks/[id]. A browser with no token asks
 * nothing and is denied at once; one whose tokens prove other decks is
 * denied after the mine call. The API is the security boundary; this is
 * presentation. Y5: the bracket line's facts are asked for from here (the
 * client), so nothing private reaches the server HTML. Private ACCOUNT
 * decks never reach this gate: the server renders them for the owner's
 * session and answers 404 to everyone else (share-access.ts).
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  DeckShareView,
  type ShareDeckCard,
  type ShareDeckMeta,
} from "@/components/deck/deck-share-view";
import { Button } from "@/components/ui/button";
import { DECK_TOKEN_HEADER, getDeckToken, listDeckTokens } from "@/lib/decks/token-store";

type GateState =
  | { state: "checking" }
  | { state: "denied" }
  | { state: "ready"; deck: ShareDeckMeta; cards: ShareDeckCard[] };

/** The mine route's batch cap (use-browser-decks.ts: more stale keys than that is pathological). */
const MINE_BATCH = 100;

export function PrivateShareGate({ publicId }: { publicId: string }) {
  const [gate, setGate] = useState<GateState>({ state: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const held = listDeckTokens();
        if (held.length === 0) {
          // Nothing this browser could prove: denied with no request. (The
          // await keeps every setState after a tick, one code path.)
          await Promise.resolve();
          setGate({ state: "denied" });
          return;
        }
        const mine = await fetch("/api/decks/mine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decks: held.slice(0, MINE_BATCH).map((h) => ({ id: h.deckId, token: h.token })),
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!mine.ok) {
          setGate({ state: "denied" });
          return;
        }
        const { decks } = (await mine.json()) as { decks: { id: string; publicId: string }[] };
        const match = decks.find((d) => d.publicId === publicId);
        const token = match ? getDeckToken(match.id) : null;
        if (!match || !token) {
          setGate({ state: "denied" });
          return;
        }
        const res = await fetch(`/api/decks/${match.id}`, {
          headers: { [DECK_TOKEN_HEADER]: token },
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
  }, [publicId]);

  // Y5: the bracket facts come from here, never the server — the client asks
  // the facts route (GET, by the id set) as the editor does; the deck wire
  // is the owner's, and DeckShareView shows only what the pod would see.
  if (gate.state === "ready") {
    return <DeckShareView deck={gate.deck} cards={gate.cards} bracketFacts={{ from: "client" }} />;
  }

  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      {gate.state === "checking" ? (
        <p className="text-muted-foreground">Loading deck…</p>
      ) : (
        <>
          <p className="max-w-md text-center">
            This deck is private. Only the browser that built it, or the signed-in account that owns
            it, can view it.
          </p>
          <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
            Back to Deckwarden
          </Button>
        </>
      )}
    </main>
  );
}
