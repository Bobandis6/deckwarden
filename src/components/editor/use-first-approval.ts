"use client";

/**
 * "Share this deck" under the Warden line (Y2b, WAVE4 D2): whether the
 * editor offers it now. The offer is born at R3's F1 transition — a render
 * where validation goes from some issues to none — and never at a mount at
 * zero, nor on the hop from "not loaded" (null) to a loaded legal deck:
 * neither has anything new to celebrate. It lands on a deck ROW: a draft
 * that approves before its row exists (an Autofill apply or an Import,
 * whose row mints a second later; a seeded precon, whose step is "Keep
 * this deck") offers nothing until the row exists, and then only while the
 * deck is still approved.
 *
 * Once per deck per browser: making the offer records the deck id
 * (share-offers.ts), so a reload, another tab or any later approval never
 * offers again; the session that made it keeps it whenever the deck is
 * approved.
 */
import { useEffect, useState } from "react";

import { markShareOffered, useShareOffered } from "@/lib/decks/share-offers";

export function useFirstApproval(approved: boolean | null, deckId: string | null): boolean {
  const offered = useShareOffered(deckId);
  // "Storing information from previous renders" (react.dev) — the
  // ValidationPanel's own settle pattern, one level up, so the deck id can
  // arrive after the approval did.
  const [prevApproved, setPrevApproved] = useState(approved);
  const [sawApproval, setSawApproval] = useState(false);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  if (prevApproved !== approved) {
    setPrevApproved(approved);
    if (prevApproved === false && approved === true) setSawApproval(true);
  }
  if (
    sawApproval &&
    approved === true &&
    deckId !== null &&
    offerFor === null &&
    offered === false
  ) {
    setOfferFor(deckId);
  }
  useEffect(() => {
    if (offerFor !== null) markShareOffered(offerFor);
  }, [offerFor]);
  return approved === true && offerFor !== null && offerFor === deckId;
}
