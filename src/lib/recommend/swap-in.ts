/**
 * "Swap in…" (Y7b, WAVE4 D8): a card added to a deck already at its
 * maximum comes in with a CUT PARTNER going out, so the count never moves.
 * Pure, game-ignorant, and the Cut Coach's own machine: the partner is
 * `rankCuts`' cheapest cut that is not a piece of a complete combo, within
 * the incoming card's curve bucket (`meta.curve.bucketOf`, the last bucket
 * holding everything past it) — the slot the new card takes is the slot
 * the old one frees. Every other card in the zone stays choosable: the
 * bucket's first, then the rest, each in the Coach's order with its
 * tradeoff, the cards the Coach can't rank (no signal data) after them by
 * name.
 *
 * No partner is named when the incoming card has no bucket (a land, a card
 * without a cost — the adapter says why, `swap.unmatched`), or when nothing
 * in its bucket is an ordinary cut; the chooser then asks the player to
 * pick. Combo membership is whatever the caller hands in (the editor's
 * bracket facts) — absent facts protect nothing, and the chooser says so.
 */
import type { CompleteCombo, CurveCardInput } from "@/lib/games/types";
import { rankCuts, type CutCandidate, type CutComboInput, type RankCutsInput } from "./cuts";

export interface SwapInOption {
  cardId: string;
  name: string;
  qty: number;
  /** The Coach's row for this card; null = no signal data, so no tradeoff to show. */
  cut: CutCandidate | null;
}

export interface SwapInPlan {
  /** The incoming card's curve bucket (clamped to the last); null = outside the curve. */
  bucket: number | null;
  /** That bucket as the curve evidence prints it ("3", "7+"); null without one. */
  bucketLabel: string | null;
  /** The named cut partner — null when there is no bucket or no ordinary cut in it. */
  partner: SwapInOption | null;
  /** The bucket's other cards: ranked (combo pieces last), then the unranked by name. */
  sameBucket: SwapInOption[];
  /** Every other card in the zone, in the same order. */
  others: SwapInOption[];
}

export interface SwapInInput extends RankCutsInput {
  /** The card coming in — never offered as its own partner. */
  incoming: CurveCardInput & { id: string };
  /** The zone the swap happens in (the main list); other zones are never partners. */
  zone: string;
}

/**
 * The bracket read's combo facts as the Cut Coach's combo input: every
 * fact is a combo whose card pieces are all in the list; its templates
 * keep `completeCombosByCard`'s rule (an open template never "breaks").
 * POST /api/alternatives' tradeoff maps the same facts the same way.
 */
export function cutCombosFromFacts(
  combos: readonly CompleteCombo[] | null,
  names: ReadonlyMap<string, { name: string }>,
): CutComboInput[] {
  return (combos ?? []).map((c) => ({
    templates: c.templates,
    missingPieces: [],
    inDeckPieces: c.cardPieces.map((id) => ({ id, name: names.get(id)?.name ?? "" })),
    results: c.results,
    popularity: c.popularity,
  }));
}

export function planSwapIn(input: SwapInInput): SwapInPlan {
  const { meta, incoming, zone } = input;
  const curve = meta.curve;
  const bucketIndex = (card: CurveCardInput): number | null => {
    if (!curve) return null;
    const b = curve.bucketOf(card);
    return b === null ? null : Math.min(b, curve.buckets.length - 1);
  };

  const { cuts } = rankCuts(input);
  const ranked = new Map(
    cuts.filter((c) => c.zone === zone).map((c, i) => [c.cardId, { cut: c, order: i }]),
  );
  const options: (SwapInOption & { bucket: number | null })[] = [];
  for (const entry of input.entries) {
    if (entry.zone !== zone || entry.card.id === incoming.id) continue;
    options.push({
      cardId: entry.card.id,
      name: entry.card.name,
      qty: entry.qty,
      cut: ranked.get(entry.card.id)?.cut ?? null,
      bucket: bucketIndex(entry.card),
    });
  }
  // The Coach's order first (combo pieces already last), then the unranked by name.
  options.sort((a, b) => {
    const ra = ranked.get(a.cardId)?.order ?? Infinity;
    const rb = ranked.get(b.cardId)?.order ?? Infinity;
    if (ra !== rb) return ra - rb;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
  });
  const strip = ({ cardId, name, qty, cut }: SwapInOption): SwapInOption => ({
    cardId,
    name,
    qty,
    cut,
  });

  const bucket = bucketIndex(incoming);
  if (bucket === null || !curve) {
    return {
      bucket: null,
      bucketLabel: null,
      partner: null,
      sameBucket: [],
      others: options.map(strip),
    };
  }
  const bucketLabel = bucket === curve.buckets.length - 1 ? `${bucket}+` : String(bucket);
  const inBucket = options.filter((o) => o.bucket === bucket);
  const partner = inBucket.find((o) => o.cut !== null && !o.cut.inCompleteCombo) ?? null;
  return {
    bucket,
    bucketLabel,
    partner: partner && strip(partner),
    sameBucket: inBucket.filter((o) => o !== partner).map(strip),
    others: options.filter((o) => o.bucket !== bucket).map(strip),
  };
}
