/**
 * Pure recommendation ranking (P3.1) — no IO, game-ignorant. Game knowledge
 * arrives through the adapter's RecommendMeta (what popularity means, the
 * editorial curve template, combo phrasing); this module owns the shared
 * machine: weighting, evidence assembly, confidence, ordering.
 *
 * Cold-start honesty (the ranking-side application of the plan's rule): a
 * missing signal contributes NOTHING — no fabricated neutral midpoints — and
 * the surviving evidence carries confidence that says what the data can
 * actually support. A candidate with no evidence at all is dropped: a bare
 * score is not a recommendation.
 *
 * Determinism: same input → same output. Ties break by popularity (asc,
 * nulls last), then name, then id.
 */
import type { CurveCardInput, RecommendMeta } from "@/lib/games/types";
import type {
  CandidateCard,
  CandidateCombo,
  Confidence,
  Recommendation,
  RecommendationEvidence,
} from "./types";

/**
 * Signal weights (sum 1). Popularity leads — it is the broadest measured
 * signal; combos outrank curve because "completes a combo with your cards"
 * is deck-specific where the curve template is editorial. Co-occurrence
 * ("played together in real decks") is deliberately absent until a real deck
 * corpus exists — see LATER.md.
 */
export const WEIGHTS = { popularity: 0.45, combos: 0.35, curve: 0.2 } as const;

/** Rank at which the popularity signal reads 0.5 (rank 1 ≈ 1.0, 10k ≈ 0.17). */
export const POPULARITY_PIVOT = 2000;

/**
 * Below this many curve-relevant deck cards, curve deficits are mostly
 * vacuous (everything is a gap), so curve evidence degrades to "low".
 */
export const CURVE_CONFIDENCE_FLOOR = 10;

/** Evidence entries per candidate from combos (the count still scores fully). */
export const COMBO_EVIDENCE_CAP = 3;

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** Max over evidence entries' confidence (shared with cuts.ts). */
export function maxConfidence(entries: readonly RecommendationEvidence[]): Confidence {
  let best: Confidence = "low";
  for (const e of entries) {
    if (CONFIDENCE_ORDER[e.confidence] > CONFIDENCE_ORDER[best]) best = e.confidence;
  }
  return best;
}

/** Monotonic rank → [0, 1]; lower rank (more played) scores higher. */
export function popularityScore(rank: number): number {
  return 1 / (1 + rank / POPULARITY_PIVOT);
}

/** One completed combo is already a strong signal; more saturate quickly. */
export function comboScore(comboCount: number): number {
  if (comboCount <= 0) return 0;
  return Math.min(1, 0.7 + 0.1 * (comboCount - 1));
}

export interface DeckCurve {
  /** Current qty-weighted counts per template bucket. */
  counts: number[];
  /** Total curve-relevant cards (what CURVE_CONFIDENCE_FLOOR measures). */
  total: number;
}

/** The deck's current curve, bucketed by the adapter's own predicate. */
export function deckCurve(
  deckCards: readonly { card: CurveCardInput; qty: number }[],
  curve: NonNullable<RecommendMeta["curve"]>,
): DeckCurve {
  const counts = new Array<number>(curve.buckets.length).fill(0);
  let total = 0;
  for (const { card, qty } of deckCards) {
    const bucket = curve.bucketOf(card);
    if (bucket === null) continue;
    counts[Math.min(bucket, counts.length - 1)] += qty;
    total += qty;
  }
  return { counts, total };
}

const bucketLabel = (i: number, len: number) => (i === len - 1 ? `${i}+` : String(i));

export interface RankInput {
  meta: RecommendMeta;
  /** The deck's current cards (all zones), for curve state. */
  deckCards: readonly { card: CurveCardInput; qty: number }[];
  /** Filtered candidate pool (already deduplicated by the caller). */
  candidates: readonly CandidateCard[];
  /** Combo participation per candidate id (empty map = no combo signal). */
  combosByCandidate: ReadonlyMap<string, readonly CandidateCombo[]>;
  limit: number;
}

export function rankCandidates(input: RankInput): Recommendation[] {
  const { meta, candidates, combosByCandidate, limit } = input;
  const curveState = meta.curve ? deckCurve(input.deckCards, meta.curve) : null;

  const ranked: Recommendation[] = [];
  for (const cand of candidates) {
    const evidence: RecommendationEvidence[] = [];
    let score = 0;

    if (meta.popularity && cand.popularity !== null) {
      const { why, howOften } = meta.popularity.evidence(cand.popularity);
      evidence.push({
        source: meta.popularity.source,
        why,
        with: [],
        howOften,
        confidence: "high",
      });
      score += WEIGHTS.popularity * popularityScore(cand.popularity);
    }

    const combos = combosByCandidate.get(cand.id) ?? [];
    if (meta.combos && combos.length > 0) {
      for (const combo of combos.slice(0, COMBO_EVIDENCE_CAP)) {
        const { why, howOften } = meta.combos.evidence({
          withNames: combo.withPieces.map((p) => p.name),
          results: combo.results,
          templates: combo.templates,
          popularity: combo.popularity,
        });
        evidence.push({
          source: meta.combos.source,
          why,
          with: [...combo.withPieces],
          howOften,
          // An unranked combo is real but unproven — degrade, don't hide.
          confidence: combo.popularity !== null ? "high" : "low",
        });
      }
      score += WEIGHTS.combos * comboScore(combos.length);
    }

    if (meta.curve && curveState) {
      const bucket = meta.curve.bucketOf(cand);
      if (bucket !== null) {
        const idx = Math.min(bucket, meta.curve.buckets.length - 1);
        const target = meta.curve.buckets[idx];
        const current = curveState.counts[idx];
        const deficit = target > 0 ? Math.max(0, target - current) / target : 0;
        // A full bucket is no reason to recommend — evidence only for real gaps.
        if (deficit > 0) {
          const { why } = meta.curve.evidence({
            bucketLabel: bucketLabel(idx, meta.curve.buckets.length),
            current,
            target,
          });
          evidence.push({
            source: meta.curve.source,
            why,
            with: [],
            howOften: null, // editorial template — there is no frequency to report
            confidence: curveState.total >= CURVE_CONFIDENCE_FLOOR ? "medium" : "low",
          });
          score += WEIGHTS.curve * deficit;
        }
      }
    }

    if (evidence.length === 0) continue; // no evidence, no recommendation

    ranked.push({
      cardId: cand.id,
      name: cand.name,
      primaryType: cand.primaryType,
      costValue: cand.costValue,
      ciMask: cand.ciMask,
      cheapestUsd: cand.cheapestUsd,
      popularity: cand.popularity,
      score,
      confidence: maxConfidence(evidence),
      evidence,
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ap = a.popularity ?? Number.MAX_SAFE_INTEGER;
    const bp = b.popularity ?? Number.MAX_SAFE_INTEGER;
    if (ap !== bp) return ap - bp;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
  });
  return ranked.slice(0, limit);
}
