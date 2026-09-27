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
 *
 * X1 (WAVE3.md D1, REC-1): with a return path the component sends the
 * visitor back to where the sign-in prompt was — AFTER the claim settles,
 * never instead of it, which is why the return goes through /account at all.
 * With no tokens there is nothing to wait for and the return is immediate. A
 * failed claim returns anyway (the next visit to /account retries it). The
 * history entry is replaced, so Back does not land on a page whose only job
 * is to leave. The status line carries the link for the case where the
 * replace never happens.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { safeNextPath } from "@/lib/auth/next-path";
import { listDeckTokens, removeDeckToken } from "@/lib/decks/token-store";

export function ClaimDecks({ next = null }: { next?: string | null }) {
  const router = useRouter();
  const [claimed, setClaimed] = useState(0);
  const startedRef = useRef(false);
  // Validated again: the page checked it, but this is where it is followed.
  const returnTo = safeNextPath(next);

  useEffect(() => {
    // Strict Mode guard: one claim attempt per mount.
    if (startedRef.current) return;
    startedRef.current = true;
    const held = listDeckTokens();
    if (held.length === 0) {
      if (returnTo !== null) router.replace(returnTo);
      return;
    }
    void (async () => {
      let claimedIds: string[] = [];
      try {
        const res = await fetch("/api/decks/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decks: held.slice(0, 100).map((h) => ({ id: h.deckId, token: h.token })),
          }),
        });
        if (res.ok) {
          const json: { claimedIds: string[] } = await res.json();
          claimedIds = json.claimedIds;
          for (const id of claimedIds) removeDeckToken(id);
        }
      } catch {
        // Silent: claiming retries on the next account-page visit.
      }
      if (returnTo !== null) {
        router.replace(returnTo);
        return;
      }
      if (claimedIds.length === 0) return;
      setClaimed(claimedIds.length);
      router.refresh();
    })();
  }, [router, returnTo]);

  if (returnTo !== null) {
    return (
      <p className="rounded-lg border px-3 py-2 text-sm" role="status">
        Signed in — taking you back…{" "}
        <Link href={returnTo} replace className="underline underline-offset-4">
          Go now
        </Link>
      </p>
    );
  }

  if (claimed === 0) return null;
  return (
    <p className="rounded-lg border px-3 py-2 text-sm" role="status">
      Moved {claimed === 1 ? "1 deck" : `${claimed} decks`} from this browser into your account.
    </p>
  );
}
