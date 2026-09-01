/**
 * Pure cut ranking (P3.4 Cut Coach) — no IO, game-ignorant, the rank.ts
 * seam in the other direction: rank.ts ranks OUTSIDE candidates to add,
 * this ranks the deck's OWN cards for removal when it exceeds its legal
 * size. Game knowledge arrives through RecommendMeta (the `cuts` phrasing
 * plus the sibling popularity/curve/combo declarations it scopes to, and
 * the hub role template); this module owns the shared machine: weights,
 * evidence assembly, confidence, ordering.
 *
 * The TRADEOFF is the product ("every suggestion shows its evidence"): a
 * cut candidate's evidence carries BOTH sides — `side: "cut"` lines argue
 * the slot is cheap to free, `side: "keep"` lines state what cutting costs
 * (a staple's play record, a combo it breaks). A card with no evidence at
 * all is dropped and counted, never listed bare: a score without a stated
 * tradeoff is not coaching.
 *
 * Honesty rules:
 * - Cold start: a missing signal contributes nothing. No popularity rank →
 *   no popularity line (an unranked card is unknown, not bad). Untagged
 *   cards get no role evidence — roles are never inferred from card text.
 * - Combo membership counts only combos that are COMPLETE in the deck
 *   right now: deckComboStatus's template rule carries over (a combo with
 *   open template requirements was never complete, so cutting a piece
 *   cannot "break" it), and every piece must still be present in the
 *   current entries — mid-edit, a cut partner instantly demotes the
 *   warning instead of leaving it stale.
 * - A complete-combo piece is never an ordinary cut: members group-sort
 *   AFTER every non-member regardless of score, and their combo warning
 *   leads the evidence.
 *
 * Determinism: same input → same output. Ties break by popularity (desc,
 * nulls last — least-played first), then name, then card id, then zone.
 */
import { deckComboStatus, type DeckComboLike } from "@/lib/combos/view";
import type { CurveCardInput, CutSide, RecommendMeta } from "@/lib/games/types";
import {
  COMBO_EVIDENCE_CAP,
  CURVE_CONFIDENCE_FLOOR,
  deckCurve,
  maxConfidence,
  popularityScore,
} from "./rank";
import type { Confidence, RecommendationEvidence } from "./types";

/** One tradeoff line: the shared evidence shape plus which side it argues. */
export interface CutEvidence extends RecommendationEvidence {
  side: CutSide;
}

/** The card fields cut ranking reads — client-held CardData, structurally. */
export interface CutCardInput extends CurveCardInput {
  id: string;
  name: string;
  cheapestUsd: number | null;
  popularity: number | null;
}

/** One deck entry as the editor holds it (zone + qty + user tags). */
export interface CutEntryInput {
  card: CutCardInput;
  zone: string;
  qty: number;
  tags: readonly string[];
}

/** A complete in-deck combo, from THIS card's perspective. */
export interface CardCompleteCombo {
  /** The combo's other pieces (all in deck). */
  withPieces: { cardId: string; name: string }[];
  results: string[];
  popularity: number | null;
}

/** The combo fields the pivot reads — DeckComboView (combos route) satisfies this. */
export interface CutComboInput extends DeckComboLike {
  inDeckPieces: readonly { id: string; name: string }[];
  results: readonly string[];
  popularity: number | null;
}

/**
 * Signal weights (sum 1) for the cut-side score. Popularity leads (the
 * broadest measured signal — "a rank-40k card is more cuttable than a
 * staple"); curve and role overloads are editorial-template comparisons;
 * price trails because it only ever compounds weak popularity. Combo
 * membership deliberately has NO weight: it is an ordering rule (members
 * last), not a scalar to tune — no weight drift can make a combo piece an
 * ordinary cut.
 */
export const CUT_WEIGHTS = { popularity: 0.45, curve: 0.25, role: 0.2, price: 0.1 } as const;

/** Price at which the price signal saturates (contribution caps at 1). */
export const PRICE_SATURATION_USD = 50;

export interface CutCandidate {
  cardId: string;
  name: string;
  /** The entry to decrement — a cut is setQty(qty − 1) on exactly this row. */
  zone: string;
  qty: number;
  cheapestUsd: number | null;
  popularity: number | null;
  /**
   * Cut-side weighted sum in [0, 1] — ordering/transparency only. Clients
   * must render evidence, never this number alone (rank.ts's rule).
   */
  score: number;
  /** Member of ≥1 complete in-deck combo — sorts after all non-members. */
  inCompleteCombo: boolean;
  /** Max over the evidence entries' confidence. */
  confidence: Confidence;
  /**
   * Non-empty, in presentation order — the lead line is WHY the card ranks
   * where it does: combo warnings first (the tradeoff that matters most),
   * then the cut-side lines (popularity, curve, role, price), then any
   * non-combo keep line ("widely played") as the trailing cost.
   */
  evidence: CutEvidence[];
}

export interface RankCutsInput {
  meta: RecommendMeta;
  /** Hub role template (adapter.hub?.roles ?? []) — labels matched to user tags. */
  roleTargets: readonly { label: string; count: number }[];
  /** ALL deck entries (leader included) — aggregates read the whole deck. */
  entries: readonly CutEntryInput[];
  /** Zones never ranked for cuts (the leader zone). Aggregates still count them. */
  excludedZones: ReadonlySet<string>;
  /** Complete-combo membership by card id (completeCombosByCard). Empty = no signal. */
  completeCombosByCard: ReadonlyMap<string, readonly CardCompleteCombo[]>;
}

export interface RankCutsResult {
  cuts: CutCandidate[];
  /** Cuttable cards dropped for lack of any evidence — disclose, never hide. */
  unranked: number;
}

/**
 * Pivot the combos route's in-deck list to per-card membership, keeping
 * only combos complete RIGHT NOW: status "complete" (no missing pieces, no
 * open template requirements — the deckComboStatus rule) and every piece
 * still present in the current entries, so between fetches an already-cut
 * partner drops the warning instead of going stale.
 */
export function completeCombosByCard(
  combos: readonly CutComboInput[],
  presentCardIds: ReadonlySet<string>,
): Map<string, CardCompleteCombo[]> {
  const byCard = new Map<string, CardCompleteCombo[]>();
  for (const combo of combos) {
    if (deckComboStatus(combo) !== "complete") continue;
    if (!combo.inDeckPieces.every((p) => presentCardIds.has(p.id))) continue;
    for (const piece of combo.inDeckPieces) {
      const list = byCard.get(piece.id) ?? [];
      list.push({
        withPieces: combo.inDeckPieces
          .filter((p) => p.id !== piece.id)
          .map((p) => ({ cardId: p.id, name: p.name })),
        results: [...combo.results],
        popularity: combo.popularity,
      });
      byCard.set(piece.id, list);
    }
  }
  return byCard;
}

const bucketLabel = (i: number, len: number) => (i === len - 1 ? `${i}+` : String(i));

export function rankCuts(input: RankCutsInput): RankCutsResult {
  const { meta, entries, excludedZones, completeCombosByCard: comboMap } = input;
  const cuts = meta.cuts;
  if (!cuts) return { cuts: [], unranked: 0 };

  // Deck-wide aggregates over ALL entries (leader included, the analytics
  // convention): the current curve, and qty-weighted counts per role tag
  // (lowercased — tag matching is case-insensitive exact, nothing fuzzier).
  const curveState =
    meta.curve && cuts.curve
      ? deckCurve(
          entries.map((e) => ({ card: e.card, qty: e.qty })),
          meta.curve,
        )
      : null;
  const roleByTag = new Map<string, { label: string; target: number }>();
  for (const role of input.roleTargets) {
    if (role.count > 0)
      roleByTag.set(role.label.toLowerCase(), { label: role.label, target: role.count });
  }
  const taggedQty = new Map<string, number>();
  if (cuts.roles && roleByTag.size > 0) {
    for (const entry of entries) {
      for (const tag of entry.tags) {
        const key = tag.toLowerCase();
        if (roleByTag.has(key)) taggedQty.set(key, (taggedQty.get(key) ?? 0) + entry.qty);
      }
    }
  }

  const ranked: CutCandidate[] = [];
  let unranked = 0;

  for (const entry of entries) {
    if (excludedZones.has(entry.zone)) continue;
    const { card } = entry;
    const evidence: CutEvidence[] = [];
    let score = 0;

    // Complete-combo membership: the cost side that matters most — leads.
    const combos = comboMap.get(card.id) ?? [];
    const inCompleteCombo =
      meta.combos !== undefined && cuts.combos !== undefined && combos.length > 0;
    if (meta.combos && cuts.combos) {
      for (const combo of combos.slice(0, COMBO_EVIDENCE_CAP)) {
        const { why, howOften } = cuts.combos.evidence({
          withNames: combo.withPieces.map((p) => p.name),
          results: combo.results,
          popularity: combo.popularity,
        });
        evidence.push({
          source: meta.combos.source,
          why,
          with: [...combo.withPieces],
          howOften,
          // The break is structurally certain; what an unranked combo can't
          // show is that the line matters — degrade like rank.ts does.
          confidence: combo.popularity !== null ? "high" : "low",
          side: "keep",
        });
      }
    }

    // Popularity: score rises with rank (same pivot as the add direction,
    // inverted), and the adapter's tier call decides which side the words
    // argue — a staple's line is a keep warning, not a cut reason. A
    // keep-side line is stashed for the tail: the LEAD line must be why the
    // card ranks where it does (a combo break, or its cut signals), with
    // "it's widely played" rendered after as the cost it is.
    let popularitySide: CutSide | null = null;
    const keepTail: CutEvidence[] = [];
    if (meta.popularity && cuts.popularity && card.popularity !== null) {
      const { why, howOften, side } = cuts.popularity.evidence(card.popularity);
      popularitySide = side;
      (side === "keep" ? keepTail : evidence).push({
        source: meta.popularity.source,
        why,
        with: [],
        howOften,
        confidence: "high",
        side,
      });
      score += CUT_WEIGHTS.popularity * (1 - popularityScore(card.popularity));
    }

    // Curve overload: cards in a bucket over its editorial target are
    // cheaper to cut, proportional to the surplus. A bucket at or under
    // target says nothing (no evidence) — mirror of rank.ts's deficit rule.
    if (meta.curve && cuts.curve && curveState) {
      const bucket = meta.curve.bucketOf(card);
      if (bucket !== null) {
        const idx = Math.min(bucket, meta.curve.buckets.length - 1);
        const target = meta.curve.buckets[idx];
        const current = curveState.counts[idx];
        const surplus = target > 0 ? Math.max(0, current - target) / target : current > 0 ? 1 : 0;
        if (surplus > 0) {
          const { why } = cuts.curve.evidence({
            bucketLabel: bucketLabel(idx, meta.curve.buckets.length),
            current,
            target,
          });
          evidence.push({
            source: meta.curve.source,
            why,
            with: [],
            howOften: null, // editorial template — no frequency to report
            confidence: curveState.total >= CURVE_CONFIDENCE_FLOOR ? "medium" : "low",
            side: "cut",
          });
          score += CUT_WEIGHTS.curve * Math.min(1, surplus);
        }
      }
    }

    // Role overload: only via this entry's own tags matched to template
    // labels. One line per overloaded role the card carries; the score
    // takes the largest surplus (multi-tagged cards aren't double-punished).
    if (cuts.roles && roleByTag.size > 0) {
      let maxRoleSurplus = 0;
      for (const tag of entry.tags) {
        const role = roleByTag.get(tag.toLowerCase());
        if (!role) continue;
        const tagged = taggedQty.get(tag.toLowerCase()) ?? 0;
        if (tagged <= role.target) continue;
        const { why } = cuts.roles.evidence({ role: role.label, tagged, target: role.target });
        evidence.push({
          source: cuts.roles.source,
          why,
          with: [],
          howOften: null,
          confidence: "medium",
          side: "cut",
        });
        maxRoleSurplus = Math.max(
          maxRoleSurplus,
          Math.min(1, (tagged - role.target) / role.target),
        );
      }
      score += CUT_WEIGHTS.role * maxRoleSurplus;
    }

    // Price: only compounds measured weak play (popularity side "cut") —
    // an expensive staple's price is not a cut argument, and with no rank
    // there is no contribution to weigh the price against.
    if (
      cuts.price &&
      popularitySide === "cut" &&
      card.cheapestUsd !== null &&
      card.cheapestUsd >= cuts.price.minUsd
    ) {
      const { why } = cuts.price.evidence({ usd: card.cheapestUsd.toFixed(2) });
      evidence.push({
        source: cuts.price.source,
        why,
        with: [],
        howOften: null,
        confidence: "medium",
        side: "cut",
      });
      score += CUT_WEIGHTS.price * Math.min(1, card.cheapestUsd / PRICE_SATURATION_USD);
    }

    evidence.push(...keepTail);
    if (evidence.length === 0) {
      unranked += 1;
      continue; // no stated tradeoff, no coaching — disclosed via the count
    }

    ranked.push({
      cardId: card.id,
      name: card.name,
      zone: entry.zone,
      qty: entry.qty,
      cheapestUsd: card.cheapestUsd,
      popularity: card.popularity,
      score,
      inCompleteCombo,
      confidence: maxConfidence(evidence),
      evidence,
    });
  }

  ranked.sort((a, b) => {
    // Complete-combo members last, whatever their score — the ordering rule
    // IS the "ranked accordingly" guarantee, not a tunable weight.
    if (a.inCompleteCombo !== b.inCompleteCombo) return a.inCompleteCombo ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    const ap = a.popularity ?? -1;
    const bp = b.popularity ?? -1;
    if (ap !== bp) return bp - ap; // deeper rank (less played) first; nulls last
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.cardId !== b.cardId) return a.cardId < b.cardId ? -1 : 1;
    return a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : 0;
  });
  return { cuts: ranked, unranked };
}
