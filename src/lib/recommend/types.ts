/**
 * Recommendation engine types (P3.1). The evidence payload IS the product
 * ("explainable deck lab"): a Recommendation is invalid without evidence —
 * rank.ts drops evidence-less candidates by construction, so a bare score
 * can never reach a client. P3.2 renders these; nothing here is UI.
 */

export type Confidence = "high" | "medium" | "low";

/**
 * One piece of evidence: why this card, with which deck cards, how often the
 * source has seen it, from which REAL data source, and how much to trust it.
 *
 * `source` names the actual dataset, adapter-declared (MTG: "edhrec_rank" |
 * "spellbook" | "curve-template") — never a vague "our algorithm".
 * `howOften` is null when the source carries no frequency (curve template)
 * or the frequency is genuinely missing (unranked combo) — absent data stays
 * absent (cold-start rule), and confidence degrades instead.
 */
export interface RecommendationEvidence {
  source: string;
  why: string;
  /** Deck cards this evidence involves (combo partners). Empty = none. */
  with: { cardId: string; name: string }[];
  howOften: string | null;
  confidence: Confidence;
}

export interface Recommendation {
  cardId: string;
  name: string;
  primaryType: string | null;
  costValue: number | null;
  ciMask: number;
  /** Numeric-as-string (pg numeric); null = no current price known. */
  cheapestUsd: string | null;
  popularity: number | null;
  /**
   * Weighted ordering score in [0, 1] — transparency/sorting only. Clients
   * must render evidence, never this number alone (see module doc).
   */
  score: number;
  /** Max over the evidence entries' confidence. */
  confidence: Confidence;
  /** Always non-empty. */
  evidence: RecommendationEvidence[];
}

/** A candidate row as the query layer returns it (queries.ts projection). */
export interface CandidateCard {
  id: string;
  name: string;
  primaryType: string | null;
  costValue: number | null;
  ciMask: number;
  cheapestUsd: string | null;
  popularity: number | null;
}

/** One combo a candidate would complete the card requirements of. */
export interface CandidateCombo {
  /** Deck cards already supplying the combo's other pieces. */
  withPieces: { cardId: string; name: string }[];
  results: string[];
  templates: string[];
  /** Spellbook popularity (EDHREC deck count); null = unranked. */
  popularity: number | null;
}
