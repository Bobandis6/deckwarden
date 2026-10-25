/**
 * Deck ownership math (P3.7) — one pure function behind every "you own
 * N/100 · missing ≈ $Y" line (editor header, share page) so the two can't
 * disagree. Honest about what it measures:
 *
 *   - "owned" is per IDENTITY: the user owns ANY printing of the card, in
 *     any quantity. Decks reference identities and the chosen printing is
 *     cosmetic, so a deck's alt-art Sol Ring is "owned" by whoever owns a
 *     Sol Ring. Multiples are NOT checked — a deck running 10 Forests
 *     counts all 10 as owned if one Forest is in the collection. (LATER.md:
 *     quantity-aware ownership.)
 *   - N and the total count copies in the format's countsTowardSize zones,
 *     the same total as the deck-size label beside it.
 *   - missing cost sums qty × the identity's CHEAPEST printing price (the
 *     cheapest_usd column the Cut Coach and hub tables use — never the
 *     chosen printing's price). Unowned cards with no known price are
 *     excluded from the sum and COUNTED, so "≈ $Y" is never quietly low.
 *   - PRECON-OWNED: `ownedCopies` (an owned precon's, precon-owned.ts) owns
 *     COPIES, not identities: per identity, whatever the zone, copies up to
 *     the precon's own quantity are owned and the rest are missing (14
 *     Forests from a 12-Forest precon cost two). The collection's identity
 *     rule still covers every copy of a card it holds. Without it the sums
 *     are exactly what they were, so the share page's line never moves.
 */
import { PRECON_COPY } from "@/lib/collection/precon-copy";
import type { FormatDef } from "@/lib/games/types";

export interface OwnershipEntry {
  cardId: string;
  zone: string;
  qty: number;
}

export interface OwnershipSummary {
  /** Copies owned / copies total, over countsTowardSize zones. */
  ownedQty: number;
  totalQty: number;
  /** Distinct unowned cards (identities), for the badge tooltip. */
  missingCards: number;
  /** Σ qty × cheapest_usd over unowned copies with a known price. */
  missingUsd: number;
  /** Unowned cards (identities) whose cheapest price is unknown — excluded from missingUsd. */
  unpricedMissing: number;
}

export function deckOwnership(
  entries: readonly OwnershipEntry[],
  cards: ReadonlyMap<string, { cheapestUsd: number | null }>,
  owned: ReadonlySet<string>,
  format: FormatDef,
  /** Copies owned per identity (an owned precon's); copies past them are missing. */
  ownedCopies?: ReadonlyMap<string, number>,
): OwnershipSummary {
  const counted = new Set(format.zones.filter((z) => z.countsTowardSize).map((z) => z.id));
  let ownedQty = 0;
  let totalQty = 0;
  let missingUsd = 0;
  const missing = new Set<string>();
  const unpriced = new Set<string>();
  // The copies still in the box, spent across the list's entries of each identity.
  const free = new Map(ownedCopies ?? []);
  for (const e of entries) {
    if (!counted.has(e.zone)) continue;
    totalQty += e.qty;
    if (owned.has(e.cardId)) {
      ownedQty += e.qty;
      continue;
    }
    const fromBox = Math.min(e.qty, free.get(e.cardId) ?? 0);
    if (fromBox > 0) {
      free.set(e.cardId, (free.get(e.cardId) ?? 0) - fromBox);
      ownedQty += fromBox;
      if (fromBox === e.qty) continue;
    }
    const short = e.qty - fromBox;
    missing.add(e.cardId);
    const price = cards.get(e.cardId)?.cheapestUsd ?? null;
    if (price === null) unpriced.add(e.cardId);
    else missingUsd += short * price;
  }
  return {
    ownedQty,
    totalQty,
    missingCards: missing.size,
    missingUsd: Math.round(missingUsd * 100) / 100,
    unpricedMissing: unpriced.size,
  };
}

/** "$1,234" style, whole dollars — an estimate off cheapest printings, not a quote. */
export function formatUsd(usd: number): string {
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

/**
 * The compact header line: "You own 63/100 · missing ≈ $412". With nothing
 * missing it says so; unpriced cards are named in the count so the estimate
 * is never mistaken for complete.
 */
export function ownershipLine(s: OwnershipSummary): string {
  const head = `You own ${s.ownedQty}/${s.totalQty}`;
  if (s.totalQty === 0) return head;
  if (s.missingCards === 0) return `${head} · nothing missing`;
  const cost =
    s.unpricedMissing > 0 && s.missingUsd === 0
      ? `missing ${s.missingCards} (no price data)`
      : `missing ≈ ${formatUsd(s.missingUsd)}`;
  const unpriced =
    s.unpricedMissing > 0 && s.missingUsd > 0 ? ` (+${s.unpricedMissing} unpriced)` : "";
  return `${head} · ${cost}${unpriced}`;
}

const COLLECTION_RULE =
  "Owned = any printing of the card is in your imported collection (quantities not checked).";
const COST_RULE =
  "Missing cost = cheapest listed printing per card; cards without a price are excluded and counted.";

/** Tooltip/title text that states the method (a collection's: the share page's, word for word). */
export const OWNERSHIP_METHOD = `${COLLECTION_RULE} ${COST_RULE}`;

/**
 * The method as the editor's line states it (PRECON-OWNED): the rules that
 * made its numbers, a collection's and an owned precon's, then the cost's.
 * With a collection alone it is OWNERSHIP_METHOD.
 */
export function ownershipMethod(by: { collection: boolean; precon: boolean }): string {
  return [by.collection && COLLECTION_RULE, by.precon && PRECON_COPY.method, COST_RULE]
    .filter((rule): rule is string => typeof rule === "string")
    .join(" ");
}
