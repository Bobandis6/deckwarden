"use client";

/**
 * Claim-on-sign-in (P2.1): the account page mounts this for signed-in users.
 * It sends every claim token this browser holds to POST /api/decks/claim,
 * discards the tokens the server confirmed claimed (claim_token is NULLed —
 * they prove nothing anymore), and refreshes so the server-rendered deck list
 * picks the claimed decks up. Tokens the server skipped stay put: a deleted
 * deck's stale key drops out of every list on its own, and a token for a deck
 * someone else claimed is dead weight the mine-list already ignores.
 *
 * Failures are silent by design — the decks stay anonymous-but-owned in this
 * browser and the next visit retries.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { listDeckTokens, removeDeckToken } from "@/lib/decks/token-store";

export function ClaimDecks() {
  const router = useRouter();
  const [claimed, setClaimed] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    // Strict Mode guard: one claim attempt per mount.
    if (startedRef.current) return;
    startedRef.current = true;
    const held = listDeckTokens();
    if (held.length === 0) return;
    void (async () => {
      try {
        const res = await fetch("/api/decks/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decks: held.slice(0, 100).map((h) => ({ id: h.deckId, token: h.token })),
          }),
        });
        if (!res.ok) return;
        const json: { claimedIds: string[] } = await res.json();
        if (json.claimedIds.length === 0) return;
        for (const id of json.claimedIds) removeDeckToken(id);
        setClaimed(json.claimedIds.length);
        router.refresh();
      } catch {
        // Silent: claiming retries on the next account-page visit.
      }
    })();
  }, [router]);

  if (claimed === 0) return null;
  return (
    <p className="rounded-lg border px-3 py-2 text-sm" role="status">
      Moved {claimed === 1 ? "1 deck" : `${claimed} decks`} from this browser into your account.
    </p>
  );
}
